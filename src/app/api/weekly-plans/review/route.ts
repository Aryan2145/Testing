import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!user.userId) return NextResponse.json([])

  const status = req.nextUrl.searchParams.get('status')
  const userId = req.nextUrl.searchParams.get('userId')
  const weekStart = req.nextUrl.searchParams.get('weekStart')

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  // Get subordinate IDs (users whose manager is the current user)
  const { data: subordinates } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('manager_user_id', user.userId)

  const subIds = (subordinates ?? []).map(s => s.id)
  if (subIds.length === 0) return NextResponse.json([])

  // If a specific userId is requested, verify they are a subordinate
  const filterIds = userId ? (subIds.includes(userId) ? [userId] : []) : subIds
  if (filterIds.length === 0) return NextResponse.json([])

  let query = supabase.from('weekly_plans')
    .select('*, users!user_id(id, name, contact), weekly_plan_items(*)')
    .eq('tenant_id', tenantId)
    .in('user_id', filterIds)
    .order('week_start_date', { ascending: false })

  if (status) query = query.eq('status', status)
  if (weekStart) query = query.eq('week_start_date', weekStart)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
