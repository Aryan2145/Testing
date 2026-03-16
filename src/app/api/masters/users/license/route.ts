import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { requireUser } from '@/lib/auth'
import { getTenantId } from '@/lib/tenant'

export async function GET() {
  await requireUser()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const [{ count }, { data: tenant }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
    supabase.from('tenants').select('license_count').eq('id', tid).single(),
  ])

  return NextResponse.json({
    used: count ?? 0,
    limit: tenant?.license_count ?? null,
  })
}
