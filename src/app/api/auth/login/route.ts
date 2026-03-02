import { NextRequest, NextResponse } from 'next/server'
import { signSession, COOKIE_NAME } from '@/lib/session'

const VALID_PHONE = '9999999999'
const VALID_PASSWORD = 'Admin@123'

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json()

  if (phone !== VALID_PHONE || password !== VALID_PASSWORD) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signSession({ phone, role: 'admin' })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })
  return res
}
