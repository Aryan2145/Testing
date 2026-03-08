import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'users', 'view')) return forbidden()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const supabase = createServerSupabase()
  const tid = getTenantId()
  let query = supabase.from('users')
    .select('*, departments(name), designations(name), levels(level_no, name), manager:manager_user_id(id, name)')
    .eq('tenant_id', tid).order('name')
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,contact.ilike.%${q}%`)
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

  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Level-based manager validation
  if (manager_user_id && level_id) {
    const { data: userLevel } = await supabase.from('levels').select('level_no').eq('id', level_id).single()
    const { data: mgr } = await supabase.from('users')
      .select('level_id, levels(level_no)').eq('id', manager_user_id).single()
    if (userLevel && mgr) {
      const mgrLevelNo = (mgr.levels as unknown as { level_no: number })?.level_no
      if (userLevel.level_no === 2 && mgrLevelNo !== 1)
        return NextResponse.json({ error: 'L2 user must have an L1 manager' }, { status: 400 })
      if (userLevel.level_no === 3 && mgrLevelNo !== 1 && mgrLevelNo !== 2)
        return NextResponse.json({ error: 'L3 user must have an L1 or L2 manager' }, { status: 400 })
    }
  }

  const { data, error } = await supabase.from('users').insert({
    name: name.trim(), email: email.trim(), contact: contact.trim(), password: password.trim(),
    department_id: department_id || null, designation_id: designation_id || null,
    level_id, profile, manager_user_id: manager_user_id || null, tenant_id: tid,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
