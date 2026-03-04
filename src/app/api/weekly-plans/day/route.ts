import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Find the weekly plan that contains this date
  const { data: plan } = await supabase
    .from('weekly_plans')
    .select('id, status')
    .eq('tenant_id', getTenantId())
    .eq('user_id', user.userId)
    .lte('week_start_date', date)
    .gte('week_end_date', date)
    .single()

  if (!plan) return NextResponse.json(null)

  const { data: items, error } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('weekly_plan_id', plan.id)
    .eq('plan_date', date)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan_status: plan.status, items: items ?? [] })
}
