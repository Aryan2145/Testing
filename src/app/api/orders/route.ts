import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { getVisibleUserIds } from '@/lib/visibility'
import { getDataScope } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type OrderItem = {
  product_id?: string | null
  product_name: string
  qty: number
  rate: number
}

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const tid = getTenantId()
  const visitId = req.nextUrl.searchParams.get('visitId')

  // Single-order mode (used by OrderEntryModal in Daily Activity — unchanged)
  if (visitId) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('tenant_id', tid)
      .eq('visit_id', visitId)
      .single()
    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(order ?? null)
  }

  // List mode — scope based on role's data_scope setting
  const status = req.nextUrl.searchParams.get('status')
  const dateFrom = req.nextUrl.searchParams.get('dateFrom')
  const dateTo = req.nextUrl.searchParams.get('dateTo')
  const userId = req.nextUrl.searchParams.get('userId')
  const q = req.nextUrl.searchParams.get('q')

  const scope = await getDataScope(user, 'orders')
  let allowedIds: string[] | null = null
  if (scope === 'own') {
    allowedIds = [user.userId!]
  } else if (scope === 'team') {
    const visibleIds = await getVisibleUserIds(user.userId!, supabase, tid)
    allowedIds = [user.userId!, ...visibleIds]
  }
  // scope === 'all' → no user_id filter

  let query = supabase
    .from('orders')
    .select('*, order_items(count), users!orders_user_id_fkey(name)')
    .eq('tenant_id', tid)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (userId) {
    query = query.eq('user_id', userId)
  } else if (allowedIds) {
    query = query.in('user_id', allowedIds)
  }

  if (status) query = query.eq('status', status)
  if (dateFrom) query = query.gte('order_date', dateFrom)
  if (dateTo) query = query.lte('order_date', dateTo)
  if (q) query = query.ilike('entity_name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const body = await req.json()
  const tenantId = getTenantId()
  const supabase = createServerSupabase()

  const items: OrderItem[] = body.items ?? []
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items are required' }, { status: 400 })
  }

  const total = items.reduce((sum, i) => sum + i.qty * i.rate, 0)

  let orderId: string

  if (body.visit_id) {
    // --- Meeting-based flow (unchanged) ---
    const { visit_id, order_date } = body as { visit_id: string; order_date: string }
    if (!order_date) return NextResponse.json({ error: 'order_date is required' }, { status: 400 })

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .upsert(
        { tenant_id: tenantId, user_id: user.userId, visit_id, order_date, total_amount: total },
        { onConflict: 'visit_id' }
      )
      .select()
      .single()

    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })
    orderId = order.id

    await supabase.from('order_items').delete().eq('order_id', orderId)

    const rows = items.map(i => ({
      tenant_id: tenantId,
      order_id: orderId,
      product_id: i.product_id ?? null,
      product_name: i.product_name,
      qty: i.qty,
      rate: i.rate,
      amount: i.qty * i.rate,
    }))
    const { error: itemsErr } = await supabase.from('order_items').insert(rows)
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

    return NextResponse.json({ ...order, total_amount: total }, { status: 201 })
  }

  // --- Direct order flow ---
  const { order_source, entity_type, entity_id, entity_name, sales_user_id, order_date, status } = body as {
    order_source: 'direct'
    entity_type: 'Dealer' | 'Distributor'
    entity_id: string
    entity_name: string
    sales_user_id?: string
    order_date: string
    status?: 'Draft' | 'Submitted' | 'Confirmed'
  }

  if (!entity_id || !entity_name || !order_date) {
    return NextResponse.json({ error: 'entity_id, entity_name and order_date are required' }, { status: 400 })
  }

  const effectiveUserId = sales_user_id ?? user.userId!

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      user_id: effectiveUserId,
      order_source: 'direct',
      entity_type,
      entity_id,
      entity_name,
      order_date,
      status: status ?? 'Draft',
      total_amount: total,
    })
    .select()
    .single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })
  orderId = order.id

  const rows = items.map(i => ({
    tenant_id: tenantId,
    order_id: orderId,
    product_id: i.product_id ?? null,
    product_name: i.product_name,
    qty: i.qty,
    rate: i.rate,
    amount: i.qty * i.rate,
  }))
  const { error: itemsErr } = await supabase.from('order_items').insert(rows)
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  return NextResponse.json({ ...order, total_amount: total }, { status: 201 })
}
