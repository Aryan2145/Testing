import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('daily_visits')
    .select('*')
    .eq('tenant_id', getTenantId())
    .eq('user_id', user.userId)
    .eq('visit_date', date)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { visit_type, entity_id, entity_name, is_new_entity, visit_date } = await req.json()
  if (!visit_type || !entity_name?.trim()) return NextResponse.json({ error: 'visit_type and entity_name are required' }, { status: 400 })
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('daily_visits').insert({
    tenant_id: getTenantId(),
    user_id: user.userId,
    visit_date: visit_date ?? new Date().toISOString().split('T')[0],
    visit_type,
    entity_id: entity_id || null,
    entity_name: entity_name.trim(),
    is_new_entity: is_new_entity ?? false,
    status: 'Pending',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
