import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const tables = ['states', 'districts', 'users', 'products', 'weekly_plans']
  const [bpDealers, bpDistributors, ...rest] = await Promise.all([
    supabase.from('business_partners').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('type', 'Dealer'),
    supabase.from('business_partners').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('type', 'Distributor'),
    ...tables.map(t =>
      supabase.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tid)
    ),
  ])

  return NextResponse.json({
    states: rest[0].count ?? 0,
    districts: rest[1].count ?? 0,
    users: rest[2].count ?? 0,
    dealers: bpDealers.count ?? 0,
    distributors: bpDistributors.count ?? 0,
    products: rest[3].count ?? 0,
    weeklyPlans: rest[4].count ?? 0,
  })
}
