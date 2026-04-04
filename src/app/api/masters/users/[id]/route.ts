import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'
import { SupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'users', 'edit')) return forbidden()
  const body = await req.json()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Fetch existing user to support protections and audit logging
  const { data: existing } = await supabase
    .from('users').select('name, profile, manager_user_id, is_superadmin').eq('id', params.id).eq('tenant_id', tid).single()
  const oldManagerId = existing?.manager_user_id ?? null

  // Superadmin account protection — only Superadmin can edit the Superadmin
  if ((existing as unknown as Record<string, unknown>)?.is_superadmin && user.role !== 'Superadmin')
    return NextResponse.json({ error: 'Only the Superadmin can modify the Superadmin account' }, { status: 403 })

  // Self-edit restrictions
  if (params.id === user.userId) {
    if (body.profile && body.profile !== existing?.profile)
      return NextResponse.json(
        { error: user.role === 'Administrator' ? 'Administrators cannot change their own role' : 'You cannot change your own role' },
        { status: 400 }
      )
    if ('manager_user_id' in body && (body.manager_user_id || null) !== (existing?.manager_user_id || null))
      return NextResponse.json({ error: 'You cannot change your own hierarchy position' }, { status: 400 })
  }

  // Profile (role) changes require Superadmin only
  if (body.profile && body.profile !== existing?.profile && user.role !== 'Superadmin')
    return NextResponse.json({ error: 'Only the Superadmin can change a user\'s role' }, { status: 403 })

  // Whitelist allowed fields — prevent arbitrary column injection
  const ALLOWED_PUT_FIELDS = ['name', 'email', 'contact', 'password', 'department_id', 'designation_id', 'profile', 'manager_user_id']
  const safeBody: Record<string, unknown> = {}
  for (const key of ALLOWED_PUT_FIELDS) {
    if (key in body) safeBody[key] = body[key]
  }
  if (safeBody.password) {
    safeBody.password = await bcrypt.hash(safeBody.password as string, 12)
  }

  const { data, error } = await supabase
    .from('users').update(safeBody).eq('id', params.id).eq('tenant_id', tid).select().single()
  if (error) {
    if (error.code === '23505' && error.message.includes('users_tenant_contact'))
      return NextResponse.json({ error: 'Number already registered. Please use a different contact number.' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit: log role and name changes
  if (existing && data) {
    if (body.profile && body.profile !== existing.profile) {
      void supabase.from('user_audit_logs').insert({
        tenant_id: tid, target_user_id: params.id, target_user_name: data.name,
        action: 'role_changed', performed_by_user_id: user.userId, performed_by_name: user.name,
        metadata: { from: existing.profile, to: body.profile },
      })
    }
    if (body.name && body.name !== existing.name) {
      void supabase.from('user_audit_logs').insert({
        tenant_id: tid, target_user_id: params.id, target_user_name: data.name,
        action: 'name_changed', performed_by_user_id: user.userId, performed_by_name: user.name,
        metadata: { from: existing.name, to: body.name },
      })
    }
  }

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser()
  if (!await checkPermission(u, 'users', 'edit')) return forbidden()

  const body = await req.json()
  const { action } = body
  if (!['deactivate', 'reactivate'].includes(action))
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  if (action === 'reactivate') {
    // License cap: only Active users consume a seat
    const [{ count: activeCount }, { data: tenant }] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'Active'),
      supabase.from('tenants').select('license_count').eq('id', tid).single(),
    ])
    if (tenant && activeCount !== null && activeCount >= tenant.license_count)
      return NextResponse.json(
        { error: 'All licensed seats are in use. Deactivate an existing user to free a seat.' },
        { status: 403 }
      )
  }

  const [{ data: targetUser }, { data: actingUserForPatch }] = await Promise.all([
    supabase.from('users').select('name, profile, manager_user_id, levels(level_no), is_superadmin').eq('id', params.id).eq('tenant_id', tid).single(),
    u.userId ? supabase.from('users').select('levels(level_no)').eq('id', u.userId).single() : Promise.resolve({ data: null }),
  ])
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Superadmin account protection
  if ((targetUser as unknown as Record<string, unknown>)?.is_superadmin && u.role !== 'Superadmin')
    return NextResponse.json({ error: 'The Superadmin account cannot be modified' }, { status: 403 })

  // Level hierarchy check: non-admins cannot deactivate/reactivate users at same or higher authority level
  const patchActingLevelNo = (actingUserForPatch?.levels as unknown as { level_no: number } | null)?.level_no ?? null
  const patchTargetLevelNo = (targetUser?.levels as unknown as { level_no: number } | null)?.level_no ?? null
  if (params.id !== u.userId && u.role !== 'Administrator' && u.role !== 'Superadmin') {
    if (patchActingLevelNo === null)
      return NextResponse.json({ error: 'Your account does not have a level assigned to manage users' }, { status: 403 })
    if (patchTargetLevelNo === null || patchTargetLevelNo <= patchActingLevelNo)
      return NextResponse.json(
        { error: 'You can only deactivate or reactivate users at lower authority levels than yourself' },
        { status: 403 }
      )
  }

  // Block deactivating the last active Administrator
  if (action === 'deactivate' && targetUser.profile === 'Administrator') {
    const { count: activeAdminCount } = await supabase
      .from('users').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid).eq('profile', 'Administrator').eq('status', 'Active')
    if ((activeAdminCount ?? 0) <= 1)
      return NextResponse.json(
        { error: 'Cannot deactivate the only active Administrator. Assign another Administrator first.' },
        { status: 400 }
      )
  }

  const updatePayload: Record<string, unknown> = { status: action === 'deactivate' ? 'Inactive' : 'Active' }
  // For reactivate, optionally update profile and manager
  if (action === 'reactivate') {
    if (body.profile) updatePayload.profile = body.profile
    if ('manager_user_id' in body) updatePayload.manager_user_id = body.manager_user_id || null
  }

  const { error } = await supabase
    .from('users').update(updatePayload).eq('id', params.id).eq('tenant_id', tid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Restore visibility chain when reactivating a user with a manager
  if (action === 'reactivate') {
    const effectiveManagerId = (('manager_user_id' in updatePayload ? updatePayload.manager_user_id : null) as string | null)
      ?? (targetUser as unknown as { manager_user_id: string | null }).manager_user_id
    if (effectiveManagerId) {
      await cascadeVisibilityUp(supabase, tid, params.id, effectiveManagerId)
    }
  }

  void supabase.from('user_audit_logs').insert({
    tenant_id: tid,
    target_user_id: params.id,
    target_user_name: targetUser.name,
    action: action === 'deactivate' ? 'deactivated' : 'reactivated',
    performed_by_user_id: u.userId,
    performed_by_name: u.name,
    metadata: action === 'reactivate' && body.profile && body.profile !== targetUser.profile
      ? { role_updated_to: body.profile }
      : {},
  })

  return NextResponse.json({ ok: true })
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
    .from('users').select('profile, is_superadmin').eq('id', params.id).eq('tenant_id', tid).single()
  if ((targetUser as unknown as Record<string, unknown>)?.is_superadmin)
    return NextResponse.json({ error: 'The Superadmin account cannot be deleted' }, { status: 400 })
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
      onConflict: 'viewer_user_id,target_user_id',
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
