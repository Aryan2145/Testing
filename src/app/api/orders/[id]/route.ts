import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Get direct reports to determine scope
  const { data: reports } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tid)
    .eq('manager_user_id', user.userId!)
  const allowedIds = [user.userId!, ...(reports ?? []).map((r: { id: string }) => r.id)]

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*), users!orders_user_id_fkey(name)')
    .eq('id', params.id)
    .eq('tenant_id', tid)
    .in('user_id', allowedIds)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  return NextResponse.json(order)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const { status } = await req.json() as { status: 'Draft' | 'Submitted' | 'Confirmed' }
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data: reports } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tid)
    .eq('manager_user_id', user.userId!)
  const allowedIds = [user.userId!, ...(reports ?? []).map((r: { id: string }) => r.id)]

  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', params.id)
    .eq('tenant_id', tid)
    .in('user_id', allowedIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
