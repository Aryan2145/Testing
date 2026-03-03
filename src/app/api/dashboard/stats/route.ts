import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const tables = ['states', 'districts', 'users', 'dealers', 'distributors', 'products', 'weekly_plans']
  const counts = await Promise.all(
    tables.map(t =>
      supabase.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tid)
    )
  )

  return NextResponse.json({
    states: counts[0].count ?? 0,
    districts: counts[1].count ?? 0,
    users: counts[2].count ?? 0,
    dealers: counts[3].count ?? 0,
    distributors: counts[4].count ?? 0,
    products: counts[5].count ?? 0,
    weeklyPlans: counts[6].count ?? 0,
  })
}
