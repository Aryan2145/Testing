import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { getVisibleUserIds } from '@/lib/visibility'

export const dynamic = 'force-dynamic'

export async function GET() {
  const manager = await requireUser()
  const supabase = createServerSupabase()
  const tenantId = getTenantId()
  const today = new Date().toISOString().split('T')[0]

  const subIds = await getVisibleUserIds(manager.userId!, supabase, tenantId)
  if (subIds.length === 0) return NextResponse.json([])

  const { data: subs } = await supabase
    .from('users')
    .select('id, name')
    .in('id', subIds)
    .eq('tenant_id', tenantId)
    .eq('status', 'Active')

  if (!subs || subs.length === 0) return NextResponse.json([])

  const activeSubIds = subs.map(s => s.id)

  // Current week range
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = monday.toISOString().split('T')[0]
  const weekEnd = sunday.toISOString().split('T')[0]

  // Get this week's plans for all subordinates
  const { data: plans } = await supabase
    .from('weekly_plans')
    .select('id, user_id, status')
    .eq('tenant_id', tenantId)
    .in('user_id', activeSubIds)
    .eq('week_start_date', weekStart)

  // Get today's visit counts
  const { data: visits } = await supabase
    .from('daily_visits')
    .select('user_id, status')
    .eq('tenant_id', tenantId)
    .in('user_id', activeSubIds)
    .eq('visit_date', today)

  // Get today's expense totals
  const { data: expenses } = await supabase
    .from('expenses')
    .select('user_id, amount')
    .eq('tenant_id', tenantId)
    .in('user_id', activeSubIds)
    .eq('expense_date', today)

  const planMap: Record<string, { id: string; status: string }> = {}
  for (const p of plans ?? []) planMap[p.user_id] = { id: p.id, status: p.status }

  const visitMap: Record<string, number> = {}
  for (const v of visits ?? []) {
    if (v.status === 'Completed') visitMap[v.user_id] = (visitMap[v.user_id] ?? 0) + 1
  }

  const expenseMap: Record<string, number> = {}
  for (const e of expenses ?? []) {
    expenseMap[e.user_id] = (expenseMap[e.user_id] ?? 0) + Number(e.amount)
  }

  const cards = subs.map(s => ({
    id: s.id,
    name: s.name,
    plan: planMap[s.id] ?? null,
    today_meetings: visitMap[s.id] ?? 0,
    today_expenses: expenseMap[s.id] ?? 0,
    week_start: weekStart,
    week_end: weekEnd,
  }))

  return NextResponse.json(cards)
}
