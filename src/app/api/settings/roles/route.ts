import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data, error } = await supabase
    .from('roles')
    .select('id, name, is_system, created_at')
    .eq('tenant_id', tid)
    .order('is_system', { ascending: false })
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data, error } = await supabase
    .from('roles')
    .insert({ tenant_id: tid, name: name.trim(), is_system: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed empty permissions for this new role for all sections
  const SECTIONS = ['locations', 'business', 'products', 'organization', 'orders', 'leads', 'users']
  await supabase.from('role_permissions').upsert(
    SECTIONS.map(s => ({
      tenant_id: tid,
      profile: name.trim(),
      section: s,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      data_scope: 'own',
    })),
    { onConflict: 'tenant_id,profile,section', ignoreDuplicates: true }
  )

  return NextResponse.json(data, { status: 201 })
}
