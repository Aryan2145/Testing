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
  const { visit_type, entity_id, entity_name, is_new_entity, visit_date, new_prospect } = await req.json()
  if (!visit_type) return NextResponse.json({ error: 'visit_type is required' }, { status: 400 })
  const today = new Date(); const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const effectiveDate = visit_date ?? todayStr
  if (effectiveDate > todayStr) return NextResponse.json({ error: 'Cannot create meetings for future dates' }, { status: 400 })
  const supabase = createServerSupabase()
  const tid = getTenantId()

  // New Prospect mode: create business_partner first, then link visit
  if (new_prospect) {
    if (!new_prospect.name?.trim()) return NextResponse.json({ error: 'Prospect name is required' }, { status: 400 })
    const { data: bp, error: bpErr } = await supabase.from('business_partners').insert({
      tenant_id: tid,
      type: visit_type,
      stage: 'Prospect',
      name: new_prospect.name.trim(),
      mobile_1: new_prospect.mobile_1?.trim() || null,
      state_id: new_prospect.state_id || null,
      district_id: new_prospect.district_id || null,
      taluka_id: new_prospect.taluka_id || null,
      village_id: new_prospect.village_id || null,
      created_by_user_id: user.userId || null,
    }).select().single()
    if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 })
    const { data, error } = await supabase.from('daily_visits').insert({
      tenant_id: tid, user_id: user.userId, visit_date: effectiveDate,
      visit_type, entity_id: bp!.id, entity_name: bp!.name, is_new_entity: true, status: 'Pending',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (!entity_name?.trim()) return NextResponse.json({ error: 'entity_name is required' }, { status: 400 })
  const { data, error } = await supabase.from('daily_visits').insert({
    tenant_id: tid, user_id: user.userId, visit_date: effectiveDate,
    visit_type, entity_id: entity_id || null, entity_name: entity_name.trim(),
    is_new_entity: is_new_entity ?? false, status: 'Pending',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
