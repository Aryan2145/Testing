import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data: existing } = await supabase
    .from('roles').select('is_system, name').eq('id', params.id).eq('tenant_id', tid).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.is_system) return NextResponse.json({ error: 'System roles cannot be renamed' }, { status: 400 })

  const oldName = existing.name
  const newName = name.trim()

  const { data, error } = await supabase
    .from('roles').update({ name: newName }).eq('id', params.id).eq('tenant_id', tid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync profile text in role_permissions and users tables
  await Promise.all([
    supabase.from('role_permissions').update({ profile: newName }).eq('tenant_id', tid).eq('profile', oldName),
    supabase.from('users').update({ profile: newName }).eq('tenant_id', tid).eq('profile', oldName),
  ])

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data: existing } = await supabase
    .from('roles').select('is_system, name').eq('id', params.id).eq('tenant_id', tid).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.is_system) return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 400 })

  // Block if any users are assigned this role
  const { count } = await supabase
    .from('users').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tid).eq('profile', existing.name)
  if ((count ?? 0) > 0)
    return NextResponse.json({ error: `Cannot delete role: ${count} user(s) still assigned to it` }, { status: 400 })

  // Delete permissions rows, then the role
  await supabase.from('role_permissions').delete().eq('tenant_id', tid).eq('profile', existing.name)
  const { error } = await supabase.from('roles').delete().eq('id', params.id).eq('tenant_id', tid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
