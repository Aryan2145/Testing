import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

async function requireSuperAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SuperAdmin') return null
  return user
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const [{ count: totalUsers }, { count: activeUsers }, { data: adminUser }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', params.id),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', params.id).eq('status', 'Active'),
    supabase.from('users').select('id,name,email,contact').eq('tenant_id', params.id).eq('profile', 'Administrator').order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ])

  return NextResponse.json({ ...tenant, total_users: totalUsers ?? 0, active_users: activeUsers ?? 0, adminUser: adminUser ?? null })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const allowed = ['name', 'email', 'phone', 'address', 'gstin', 'license_count', 'payment_status', 'payment_due_date', 'is_active']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (update.license_count !== undefined) update.license_count = Number(update.license_count)

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('tenants')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update admin user if payload provided
  if (body.adminUser?.id) {
    const { id: adminId, name: adminName, email: adminEmail, contact: adminContact, password: adminPassword } = body.adminUser
    const userUpdate: Record<string, unknown> = {}
    if (adminName !== undefined) userUpdate.name = adminName.trim()
    if (adminEmail !== undefined) userUpdate.email = adminEmail.trim() || null
    if (adminContact !== undefined && adminContact.trim()) userUpdate.contact = adminContact.trim()
    if (adminPassword !== undefined && adminPassword.trim()) userUpdate.password = adminPassword.trim()
    if (Object.keys(userUpdate).length > 0) {
      await supabase.from('users').update(userUpdate).eq('id', adminId)
    }
  }

  return NextResponse.json(data)
}
