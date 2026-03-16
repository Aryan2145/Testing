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

  // Fetch existing manager before update so we can diff
  const { data: existing } = await supabase
    .from('users').select('manager_user_id').eq('id', params.id).single()
  const oldManagerId = existing?.manager_user_id ?? null

  const { data, error } = await supabase
    .from('users').update(body).eq('id', params.id).eq('tenant_id', tid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync user_visibility when manager changes
  const newManagerId = ('manager_user_id' in body) ? (body.manager_user_id ?? null) : oldManagerId
  if (oldManagerId !== newManagerId) {
    if (oldManagerId) {
      await supabase.from('user_visibility')
        .delete()
        .eq('tenant_id', tid)
        .eq('viewer_user_id', oldManagerId)
        .eq('target_user_id', params.id)
    }
    if (newManagerId) {
      await supabase.from('user_visibility').upsert(
        { tenant_id: tid, viewer_user_id: newManagerId, target_user_id: params.id },
        { onConflict: 'tenant_id,viewer_user_id,target_user_id', ignoreDuplicates: true }
      )
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser()
  if (!await checkPermission(u, 'users', 'delete')) return forbidden()
  const supabase = createServerSupabase()
  const tid = getTenantId()
  const { count } = await supabase
    .from('users').select('id', { count: 'exact', head: true }).eq('manager_user_id', params.id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Cannot delete user who has subordinates' }, { status: 400 })
  const { error } = await supabase
    .from('users').delete().eq('id', params.id).eq('tenant_id', tid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clean up all user_visibility rows involving this user
  await supabase.from('user_visibility')
    .delete()
    .eq('tenant_id', tid)
    .or(`viewer_user_id.eq.${params.id},target_user_id.eq.${params.id}`)

  return NextResponse.json({ ok: true })
}
