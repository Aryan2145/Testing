import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'edit')) return forbidden()
  const body = await req.json()
  if (body.latitude != null && (isNaN(Number(body.latitude)) || Number(body.latitude) < -90 || Number(body.latitude) > 90))
    return NextResponse.json({ error: 'Latitude must be between -90 and 90' }, { status: 400 })
  if (body.longitude != null && (isNaN(Number(body.longitude)) || Number(body.longitude) < -180 || Number(body.longitude) > 180))
    return NextResponse.json({ error: 'Longitude must be between -180 and 180' }, { status: 400 })
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dealers').update(body).eq('id', params.id).eq('tenant_id', getTenantId()).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'delete')) return forbidden()
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('dealers').delete().eq('id', params.id).eq('tenant_id', getTenantId())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
