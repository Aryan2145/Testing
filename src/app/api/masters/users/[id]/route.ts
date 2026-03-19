import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'
import { SupabaseClient } from '@supabase/supabase-js'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'users', 'edit')) return forbidden()
  const body = await req.json()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Level-based manager validation: manager must have a strictly lower level_no
  if (body.manager_user_id && body.level_id) {
    const { data: userLevel } = await supabase.from('levels').select('level_no').eq('id', body.level_id).single()
    const { data: mgr } = await supabase.from('users')
      .select('level_id, levels(level_no)').eq('id', body.manager_user_id).single()
    if (userLevel && mgr) {
      const mgrLevelNo = (mgr.levels as unknown as { level_no: number })?.level_no
      if (mgrLevelNo >= userLevel.level_no)
        return NextResponse.json({ error: 'Manager must be at a higher level than the user' }, { status: 400 })
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
    // Remove all old ancestor visibility for this user (cascade down was from old manager up)
    if (oldManagerId) {
      await removeAncestorVisibility(supabase, tid, params.id, oldManagerId)
    }
    // Add new cascade visibility up the new manager chain
    if (newManagerId) {
      await cascadeVisibilityUp(supabase, tid, params.id, newManagerId)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser()
  if (!await checkPermission(u, 'users', 'delete')) return forbidden()

  // Block self-deletion
  if (u.userId === params.id)
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Block deletion of the last Administrator
  const { data: targetUser } = await supabase
    .from('users').select('profile').eq('id', params.id).eq('tenant_id', tid).single()
  if (targetUser?.profile === 'Administrator') {
    const { count: adminCount } = await supabase
      .from('users').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid).eq('profile', 'Administrator')
    if ((adminCount ?? 0) <= 1)
      return NextResponse.json({ error: 'Cannot delete the only Administrator account' }, { status: 400 })
  }

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

/** Insert visibility rows so managerId and all their managers can see userId. */
async function cascadeVisibilityUp(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  managerId: string
) {
  const rows: { tenant_id: string; viewer_user_id: string; target_user_id: string }[] = []
  let currentId: string | null = managerId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    rows.push({ tenant_id: tenantId, viewer_user_id: currentId, target_user_id: userId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await supabase.from('users').select('manager_user_id').eq('id', currentId).single()
    currentId = (res.data?.manager_user_id as string | null) ?? null
  }

  if (rows.length > 0) {
    await supabase.from('user_visibility').upsert(rows, {
      onConflict: 'tenant_id,viewer_user_id,target_user_id',
      ignoreDuplicates: true,
    })
  }
}

/** Remove visibility rows from old manager chain that were auto-cascaded.
 *  Only removes rows where the viewer is in the old manager ancestor chain
 *  AND the visibility is not manually overridden (i.e., still part of the cascade).
 *  Safe approach: delete all rows where target=userId and viewer is in old ancestor chain. */
async function removeAncestorVisibility(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  oldManagerId: string
) {
  const ancestorIds: string[] = []
  let currentId: string | null = oldManagerId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    ancestorIds.push(currentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await supabase.from('users').select('manager_user_id').eq('id', currentId).single()
    currentId = (res.data?.manager_user_id as string | null) ?? null
  }

  if (ancestorIds.length > 0) {
    await supabase.from('user_visibility')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('target_user_id', userId)
      .in('viewer_user_id', ancestorIds)
  }
}
