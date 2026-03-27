import { NextRequest, NextResponse } from 'next/server'
import { signSession, COOKIE_NAME } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json()
  if (!phone || !password) return NextResponse.json({ error: 'Phone and password are required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Query user by contact globally (multi-tenant: no tenant filter)
  const { data: user, error: dbError } = await supabase
    .from('users')
    .select('id, name, profile, contact, password, status, tenant_id, is_superadmin')
    .eq('contact', phone.trim())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!dbError && user) {
    const isHashed = user.password?.startsWith('$2')
    const isValid = isHashed
      ? await bcrypt.compare(password, user.password)
      : user.password === password
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 })
    }
    // Lazily upgrade plaintext password to hash on first successful login
    if (!isHashed) {
      const hash = await bcrypt.hash(password, 12)
      void supabase.from('users').update({ password: hash }).eq('id', user.id)
    }
    if (user.status !== 'Active') {
      return NextResponse.json({ error: 'Account is inactive. Contact your administrator.' }, { status: 403 })
    }

    // Check tenant status
    if (user.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('is_active, payment_status')
        .eq('id', user.tenant_id)
        .single()
      if (tenant) {
        if (!tenant.is_active) {
          return NextResponse.json({ error: 'Your company account is disabled. Please contact support.' }, { status: 403 })
        }
        if (tenant.payment_status === 'Suspended') {
          return NextResponse.json({ error: "Your company's access has been suspended. Please contact support." }, { status: 403 })
        }
      }
    }

    const token = await signSession({
      phone: user.contact,
      userId: user.id,
      name: user.name,
      role: user.is_superadmin ? 'Superadmin' : user.profile,
      tenantId: user.tenant_id ?? process.env.DEFAULT_TENANT_ID ?? '',
    })
    // Record login event (fire-and-forget, never block login)
    void supabase.from('user_login_logs').insert({
      tenant_id: user.tenant_id ?? process.env.DEFAULT_TENANT_ID,
      user_id: user.id,
      ip_address: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
    })
    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
    return res
  }

  // Fallback: hardcoded admin
  if (phone.trim() === '9999999999' && password === 'Admin@123') {
    const { data: basicUser } = await supabase
      .from('users')
      .select('id, name, profile, tenant_id, is_superadmin')
      .eq('contact', phone.trim())
      .maybeSingle()
    const token = await signSession({
      phone: phone.trim(),
      userId: basicUser?.id ?? null,
      name: basicUser?.name ?? 'Admin User',
      role: basicUser?.is_superadmin ? 'Superadmin' : (basicUser?.profile ?? 'Administrator'),
      tenantId: basicUser?.tenant_id ?? process.env.DEFAULT_TENANT_ID ?? '',
    })
    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
    return res
  }

  return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 })
}
