import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireUser()
  const body = await req.json()
  const supabase = createServerSupabase()
  const { action, latitude, longitude, address } = body

  if (action === 'start') {
    // Check no other visit is currently Active for this user today
    const { data: active } = await supabase
      .from('daily_visits')
      .select('id')
      .eq('tenant_id', getTenantId())
      .eq('status', 'Active')
      .neq('id', params.id)
      .limit(1)
    if (active && active.length > 0) {
      return NextResponse.json({ error: 'Another visit is already active. Stop it first.' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('daily_visits')
      .update({ status: 'Active', start_time: new Date().toISOString(), latitude: latitude ?? null, longitude: longitude ?? null, address: address ?? null })
      .eq('id', params.id).eq('tenant_id', getTenantId()).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'stop') {
    const { data: visit } = await supabase.from('daily_visits').select('start_time').eq('id', params.id).single()
    const durationSecs = visit?.start_time
      ? Math.floor((Date.now() - new Date(visit.start_time).getTime()) / 1000)
      : 0
    const { data, error } = await supabase
      .from('daily_visits')
      .update({ status: 'Completed', end_time: new Date().toISOString(), duration_secs: durationSecs })
      .eq('id', params.id).eq('tenant_id', getTenantId()).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'delete') {
    const { error } = await supabase.from('daily_visits').delete().eq('id', params.id).eq('tenant_id', getTenantId())
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
