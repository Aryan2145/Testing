import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/session'

const PUBLIC = ['/login', '/reset-password', '/api/auth/login', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const payload = await verifySession(token)
  if (!payload) return NextResponse.redirect(new URL('/login', req.url))

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
