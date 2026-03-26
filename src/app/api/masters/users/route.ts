import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'
import { SupabaseClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'users', 'view')) return forbidden()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const scope = req.nextUrl.searchParams.get('scope')
  const supabase = createServerSupabase()
  const tid = getTenantId()
  let query = supabase.from('users')
    .select('*, departments(name), designations(name), levels(level_no, name), manager:manager_user_id(id, name)')
    .eq('tenant_id', tid).order('name')
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,contact.ilike.%${q}%`)

  // scope=manage: only return users at lower authority levels (higher level_no)
  // Administrators always see all users regardless of scope
  if (scope === 'manage' && user.userId && user.role !== 'Administrator') {
    const { data: actingUser } = await supabase
      .from('users').select('levels(level_no)').eq('id', user.userId).single()
    const actingLevelNo = (actingUser?.levels as unknown as { level_no: number } | null)?.level_no ?? null
    if (actingLevelNo !== null) {
      const { data: subordinateLevels } = await supabase
        .from('levels').select('id').eq('tenant_id', tid).gt('level_no', actingLevelNo)
      const subordinateLevelIds = (subordinateLevels ?? []).map((l: { id: string }) => l.id)
      if (subordinateLevelIds.length === 0) return NextResponse.json([])
      query = query.in('level_id', subordinateLevelIds)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'users', 'edit')) return forbidden()
  const { name, email, contact, password, department_id, designation_id, level_id, profile, manager_user_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!contact?.trim()) return NextResponse.json({ error: 'Contact is required' }, { status: 400 })
  if (!password?.trim()) return NextResponse.json({ error: 'Password is required' }, { status: 400 })
  if (!level_id) return NextResponse.json({ error: 'Level is required' }, { status: 400 })
  if (!profile) return NextResponse.json({ error: 'Profile is required' }, { status: 400 })
  if (user.role !== 'Administrator')
    return NextResponse.json({ error: 'Only Administrators can create users' }, { status: 403 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Acting user must have higher authority (lower level_no) than the user being created
  if (user.userId) {
    const [{ data: actingUser }, { data: targetLevel }] = await Promise.all([
      supabase.from('users').select('levels(level_no)').eq('id', user.userId).single(),
      supabase.from('levels').select('level_no').eq('id', level_id).single(),
    ])
    const actingLevelNo = (actingUser?.levels as unknown as { level_no: number } | null)?.level_no ?? null
    if (actingLevelNo !== null && targetLevel && targetLevel.level_no <= actingLevelNo)
      return NextResponse.json(
        { error: 'You can only create users at lower authority levels than yourself' },
        { status: 403 }
      )
  }

  // License cap enforcement
  const [{ count: userCount }, { data: tenant }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'Active'),
    supabase.from('tenants').select('license_count').eq('id', tid).single(),
  ])
  if (tenant && userCount !== null && userCount >= tenant.license_count) {
    return NextResponse.json(
      { error: `User limit reached (${userCount}/${tenant.license_count}). Please contact My Prosys Support team to upgrade your plan.` },
      { status: 403 }
    )
  }

  // Level-based manager validation: manager must have a strictly lower level_no
  if (manager_user_id && level_id) {
    const { data: userLevel } = await supabase.from('levels').select('level_no').eq('id', level_id).single()
    const { data: mgr } = await supabase.from('users')
      .select('level_id, levels(level_no)').eq('id', manager_user_id).single()
    if (userLevel && mgr) {
      const mgrLevelNo = (mgr.levels as unknown as { level_no: number })?.level_no
      if (mgrLevelNo >= userLevel.level_no)
        return NextResponse.json({ error: 'Manager must be at a higher level than the user' }, { status: 400 })
    }
  }

  const { data, error } = await supabase.from('users').insert({
    name: name.trim(), email: email.trim(), contact: contact.trim(), password: password.trim(),
    department_id: department_id || null, designation_id: designation_id || null,
    level_id, profile, manager_user_id: manager_user_id || null, tenant_id: tid,
  }).select().single()
  if (error) {
    if (error.code === '23505' && error.message.includes('users_tenant_contact'))
      return NextResponse.json({ error: 'Number already registered. Please use a different contact number.' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Cascade visibility: new user is visible to their manager and all ancestors
  if (manager_user_id && data) {
    await cascadeVisibilityUp(supabase, tid, data.id, manager_user_id)
  }

  // Audit log
  void supabase.from('user_audit_logs').insert({
    tenant_id: tid,
    target_user_id: data.id,
    target_user_name: data.name,
    action: 'created',
    performed_by_user_id: user.userId,
    performed_by_name: user.name,
    metadata: { profile },
  })

  return NextResponse.json(data, { status: 201 })
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
