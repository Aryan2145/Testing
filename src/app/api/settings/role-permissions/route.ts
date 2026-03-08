import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

const SECTIONS = ['locations', 'business', 'products', 'organization', 'users'] as const

export async function GET() {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()
  const tid = getTenantId()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('section, can_view, can_edit, can_delete')
    .eq('tenant_id', tid)
    .eq('profile', 'Standard')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result: Record<string, { view: boolean; edit: boolean; delete: boolean }> = {}
  for (const s of SECTIONS) {
    const row = (data ?? []).find(r => r.section === s)
    result[s] = row
      ? { view: row.can_view, edit: row.can_edit, delete: row.can_delete }
      : { view: false, edit: false, delete: false }
  }

  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { section, can_view, can_edit, can_delete } = await req.json()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { error } = await supabase.from('role_permissions').upsert(
    { tenant_id: tid, profile: 'Standard', section, can_view, can_edit, can_delete },
    { onConflict: 'tenant_id,profile,section' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
