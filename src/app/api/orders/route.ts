import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type OrderItem = {
  product_id?: string | null
  product_name: string
  qty: number
  rate: number
}

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const visitId = req.nextUrl.searchParams.get('visitId')
  if (!visitId) return NextResponse.json({ error: 'visitId is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('tenant_id', getTenantId())
    .eq('visit_id', visitId)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(order ?? null)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { visit_id, order_date, items } = await req.json() as {
    visit_id: string
    order_date: string
    items: OrderItem[]
  }

  if (!visit_id || !order_date || !Array.isArray(items)) {
    return NextResponse.json({ error: 'visit_id, order_date and items are required' }, { status: 400 })
  }

  const tenantId = getTenantId()
  const supabase = createServerSupabase()

  const total = items.reduce((sum, i) => sum + i.qty * i.rate, 0)

  // Upsert order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .upsert(
      { tenant_id: tenantId, user_id: user.userId, visit_id, order_date, total_amount: total },
      { onConflict: 'visit_id' }
    )
    .select()
    .single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

  // Delete old items then insert new
  await supabase.from('order_items').delete().eq('order_id', order.id)

  if (items.length > 0) {
    const rows = items.map(i => ({
      tenant_id: tenantId,
      order_id: order.id,
      product_id: i.product_id ?? null,
      product_name: i.product_name,
      qty: i.qty,
      rate: i.rate,
      amount: i.qty * i.rate,
    }))
    const { error: itemsErr } = await supabase.from('order_items').insert(rows)
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  return NextResponse.json({ ...order, total_amount: total }, { status: 201 })
}
