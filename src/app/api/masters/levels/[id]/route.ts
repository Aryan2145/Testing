import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'organization', 'edit')) return forbidden()
  const body = await req.json()
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('levels').update(body).eq('id', params.id).eq('tenant_id', getTenantId()).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'organization', 'delete')) return forbidden()
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('levels').delete().eq('id', params.id).eq('tenant_id', getTenantId())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
