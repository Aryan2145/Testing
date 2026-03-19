import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

async function requireSuperAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SuperAdmin') return null
  return user
}

export async function GET() {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()

  // Get all tenants
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get user counts per tenant
  const { data: userCounts } = await supabase
    .from('users')
    .select('tenant_id')
  const countMap = new Map<string, number>()
  for (const u of userCounts ?? []) {
    countMap.set(u.tenant_id, (countMap.get(u.tenant_id) ?? 0) + 1)
  }

  const result = (tenants ?? []).map(t => ({
    ...t,
    user_count: countMap.get(t.id) ?? 0,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const {
    name, email, phone, address, gstin,
    license_count, payment_due_date,
    adminName, adminEmail, adminPhone, adminPassword,
  } = await req.json()

  if (!name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  if (!adminName?.trim()) return NextResponse.json({ error: 'Admin name is required' }, { status: 400 })
  if (!adminPhone?.trim()) return NextResponse.json({ error: 'Admin phone is required' }, { status: 400 })
  if (!adminPassword?.trim()) return NextResponse.json({ error: 'Admin password is required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Check admin phone is not already in use
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('contact', adminPhone.trim())
    .maybeSingle()
  if (existingUser) {
    return NextResponse.json({ error: 'A user with this phone number already exists' }, { status: 400 })
  }

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      gstin: gstin?.trim() || null,
      license_count: license_count ? Number(license_count) : 10,
      payment_due_date: payment_due_date || null,
    })
    .select()
    .single()
  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })

  const tid = tenant.id

  // Auto-create 3 default levels
  const { data: levels, error: levelsError } = await supabase
    .from('levels')
    .insert([
      { tenant_id: tid, level_no: 1, name: 'L1 - Admin' },
      { tenant_id: tid, level_no: 2, name: 'L2 - Manager' },
      { tenant_id: tid, level_no: 3, name: 'L3 - Executive' },
    ])
    .select()
  if (levelsError) {
    // Rollback tenant
    await supabase.from('tenants').delete().eq('id', tid)
    return NextResponse.json({ error: levelsError.message }, { status: 500 })
  }

  const l1 = levels?.find(l => l.level_no === 1)
  if (!l1) return NextResponse.json({ error: 'Failed to create default levels' }, { status: 500 })

  // Auto-provision system roles for new tenant
  const { error: rolesError } = await supabase.from('roles').insert([
    { tenant_id: tid, name: 'Administrator', is_system: true },
    { tenant_id: tid, name: 'Standard', is_system: true },
  ])
  if (rolesError) {
    await supabase.from('levels').delete().eq('tenant_id', tid)
    await supabase.from('tenants').delete().eq('id', tid)
    return NextResponse.json({ error: rolesError.message }, { status: 500 })
  }

  // Seed Standard role permissions (sensible defaults — view+create own data)
  const SECTIONS = ['locations', 'business', 'products', 'organization', 'users', 'orders', 'leads']
  await supabase.from('role_permissions').insert(
    SECTIONS.map(s => ({
      tenant_id: tid,
      profile: 'Standard',
      section: s,
      can_view: true,
      can_create: true,
      can_edit: false,
      can_delete: false,
      data_scope: 'own',
    }))
  )

  // Seed lead masters (stages, temperatures, types)
  await Promise.all([
    supabase.from('lead_stages').insert([
      { tenant_id: tid, name: 'Prospect',    sort_order: 1,   is_fixed: true },
      { tenant_id: tid, name: 'Contacted',   sort_order: 2,   is_fixed: false },
      { tenant_id: tid, name: 'Interested',  sort_order: 3,   is_fixed: false },
      { tenant_id: tid, name: 'Qualified',   sort_order: 4,   is_fixed: false },
      { tenant_id: tid, name: 'Proposal',    sort_order: 5,   is_fixed: false },
      { tenant_id: tid, name: 'Negotiation', sort_order: 6,   is_fixed: false },
      { tenant_id: tid, name: 'Existing',    sort_order: 999, is_fixed: true },
    ]),
    supabase.from('lead_temperatures').insert([
      { tenant_id: tid, name: 'Cold', sort_order: 1 },
      { tenant_id: tid, name: 'Warm', sort_order: 2 },
      { tenant_id: tid, name: 'Hot',  sort_order: 3 },
    ]),
    supabase.from('lead_types').insert([
      { tenant_id: tid, name: 'Dealer',       sort_order: 1 },
      { tenant_id: tid, name: 'Distributor',  sort_order: 2 },
      { tenant_id: tid, name: 'Institution',  sort_order: 3 },
      { tenant_id: tid, name: 'End Consumer', sort_order: 4 },
    ]),
    supabase.from('expense_categories').insert([
      { tenant_id: tid, name: 'Travel',        sort_order: 1 },
      { tenant_id: tid, name: 'Food',          sort_order: 2 },
      { tenant_id: tid, name: 'Accommodation', sort_order: 3 },
      { tenant_id: tid, name: 'Communication', sort_order: 4 },
      { tenant_id: tid, name: 'Miscellaneous', sort_order: 5 },
    ]),
  ])

  // Create admin user
  const { data: adminUser, error: userError } = await supabase
    .from('users')
    .insert({
      tenant_id: tid,
      name: adminName.trim(),
      email: adminEmail?.trim() || `admin@${name.trim().toLowerCase().replace(/\s+/g, '')}.local`,
      contact: adminPhone.trim(),
      password: adminPassword.trim(),
      profile: 'Administrator',
      level_id: l1.id,
      status: 'Active',
    })
    .select()
    .single()
  if (userError) {
    // Rollback
    await supabase.from('roles').delete().eq('tenant_id', tid)
    await supabase.from('levels').delete().eq('tenant_id', tid)
    await supabase.from('tenants').delete().eq('id', tid)
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  return NextResponse.json({ tenant, user: adminUser }, { status: 201 })
}
