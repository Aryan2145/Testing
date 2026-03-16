import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

export async function POST(req: NextRequest) {
  const { token, password, confirmPassword } = await req.json()

  if (!token || !password)
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
  if (password !== confirmPassword)
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 })
  if (password.length < 6)
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data: user } = await supabase
    .from('users')
    .select('id, password_reset_expires')
    .eq('password_reset_token', token)
    .eq('tenant_id', tid)
    .maybeSingle()

  if (!user)
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })

  if (!user.password_reset_expires || new Date(user.password_reset_expires) < new Date())
    return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 })

  await supabase.from('users').update({
    password,
    password_reset_token: null,
    password_reset_expires: null,
  }).eq('id', user.id)

  return NextResponse.json({ ok: true })
}
