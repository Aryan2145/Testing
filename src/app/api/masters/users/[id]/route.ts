import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'users', 'edit')) return forbidden()
  const body = await req.json()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  if (body.manager_user_id && body.level_id) {
    const { data: userLevel } = await supabase.from('levels').select('level_no').eq('id', body.level_id).single()
    const { data: mgr } = await supabase.from('users')
      .select('level_id, levels(level_no)').eq('id', body.manager_user_id).single()
    if (userLevel && mgr) {
      const mgrLevelNo = (mgr.levels as unknown as { level_no: number })?.level_no
      if (userLevel.level_no === 2 && mgrLevelNo !== 1)
        return NextResponse.json({ error: 'L2 user must have an L1 manager' }, { status: 400 })
      if (userLevel.level_no === 3 && mgrLevelNo !== 1 && mgrLevelNo !== 2)
        return NextResponse.json({ error: 'L3 user must have an L1 or L2 manager' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('users').update(body).eq('id', params.id).eq('tenant_id', tid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser()
  if (!await checkPermission(u, 'users', 'delete')) return forbidden()
  const supabase = createServerSupabase()
  const { count } = await supabase
    .from('users').select('id', { count: 'exact', head: true }).eq('manager_user_id', params.id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Cannot delete user who has subordinates' }, { status: 400 })
  const { error } = await supabase
    .from('users').delete().eq('id', params.id).eq('tenant_id', getTenantId())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
