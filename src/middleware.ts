import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/session'

const PUBLIC = ['/login', '/reset-password', '/api/auth/login', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Super Admin routes ──────────────────────────────────────────
  if (pathname === '/superadmin' || pathname.startsWith('/superadmin/')) {
    // Public: SA login page
    if (pathname === '/superadmin/login') return NextResponse.next()

    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.redirect(new URL('/superadmin/login', req.url))
    const payload = await verifySession(token)
    if (!payload || (payload as { role?: string }).role !== 'SuperAdmin') {
      return NextResponse.redirect(new URL('/superadmin/login', req.url))
    }
    return NextResponse.next()
  }

  // SA accessing SA API without a page redirect
  if (pathname === '/api/superadmin/auth/login') return NextResponse.next()

  if (pathname.startsWith('/api/superadmin/')) {
    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifySession(token)
    if (!payload || (payload as { role?: string }).role !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.next()
  }

  // ── Regular public routes ────────────────────────────────────────
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // ── Regular protected routes ─────────────────────────────────────
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const payload = await verifySession(token)
  if (!payload) return NextResponse.redirect(new URL('/login', req.url))

  // Block SuperAdmin from accessing tenant app
  if ((payload as { role?: string }).role === 'SuperAdmin') {
    return NextResponse.redirect(new URL('/superadmin/companies', req.url))
  }

  // Forward tenant id to API routes via request header
  const tenantId = (payload as { tenantId?: string }).tenantId || process.env.DEFAULT_TENANT_ID || ''
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-tenant-id', tenantId)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|site.webmanifest).*)'],
}
