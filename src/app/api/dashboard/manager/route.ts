import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { getVisibleUserIds } from '@/lib/visibility'

export const dynamic = 'force-dynamic'

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const weekStart = req.nextUrl.searchParams.get('weekStart') ?? (() => {
    const d = new Date()
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const weekEnd = addDays(weekStart, 6)

  const subIds = await getVisibleUserIds(user.userId!, supabase, tid)
  if (!subIds.length) return NextResponse.json({ isManager: false })

  const { data: subordinates } = await supabase
    .from('users')
    .select('id, name')
    .in('id', subIds)
    .eq('tenant_id', tid)

  if (!subordinates || subordinates.length === 0) {
    return NextResponse.json({ isManager: false })
  }

  const activeSubIds = subordinates.map(s => s.id)

  // Parallel data fetch for the week
  const [plansRes, visitsRes, ordersRes, expensesRes] = await Promise.all([
    supabase
      .from('weekly_plans')
      .select('id, user_id, status, submitted_at, reopen_requested, reopen_request_message, week_start_date')
      .eq('tenant_id', tid)
      .eq('week_start_date', weekStart)
      .in('user_id', activeSubIds),

    supabase
      .from('daily_visits')
      .select('id, user_id, status, visit_date')
      .eq('tenant_id', tid)
      .in('user_id', activeSubIds)
      .gte('visit_date', weekStart)
      .lte('visit_date', weekEnd),

    supabase
      .from('orders')
      .select('user_id, order_date, total_amount, status')
      .eq('tenant_id', tid)
      .in('user_id', activeSubIds)
      .gte('order_date', weekStart)
      .lte('order_date', weekEnd),

    supabase
      .from('expenses')
      .select('user_id, expense_date, amount')
      .eq('tenant_id', tid)
      .in('user_id', activeSubIds)
      .gte('expense_date', weekStart)
      .lte('expense_date', weekEnd),
  ])

  const plans = plansRes.data ?? []
  const visits = visitsRes.data ?? []
  const orders = ordersRes.data ?? []
  const expenses = expensesRes.data ?? []

  // Plan stats
  const planStats = { approved: 0, submitted: 0, rejected: 0, draft: 0, onHold: 0, notSubmitted: 0 }
  const planByUserId: Record<string, typeof plans[0]> = {}
  for (const p of plans) {
    planByUserId[p.user_id] = p
    if (p.status === 'Approved') planStats.approved++
    else if (p.status === 'Submitted' || p.status === 'Resubmitted') planStats.submitted++
    else if (p.status === 'Rejected') planStats.rejected++
    else if (p.status === 'Draft' || p.status === 'Edited by Manager') planStats.draft++
    else if (p.status === 'On Hold') planStats.onHold++
  }
  planStats.notSubmitted = subordinates.length - plans.length

  // Pending plans (submitted + reopen requests)
  const pendingPlans = plans
    .filter(p => ['Submitted', 'Resubmitted'].includes(p.status) || p.reopen_requested)
    .map(p => {
      const sub = subordinates.find(s => s.id === p.user_id)
      return {
        id: p.id,
        userId: p.user_id,
        userName: sub?.name ?? 'Unknown',
        weekStartDate: p.week_start_date,
        status: p.status,
        reopen_requested: p.reopen_requested,
        reopen_request_message: p.reopen_request_message,
      }
    })

  // Build per-member daily activity
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const teamPerformance = subordinates.map(sub => {
    const plan = planByUserId[sub.id] ?? null

    const dailyActivity = weekDays.map(date => {
      const dayVisits = visits.filter(v => v.user_id === sub.id && v.visit_date === date)
      const dayOrders = orders.filter(o => o.user_id === sub.id && o.order_date === date)
      const dayExpenses = expenses.filter(e => e.user_id === sub.id && e.expense_date === date)
      return {
        date,
        meetingsCompleted: dayVisits.filter(v => v.status === 'Completed').length,
        meetingsTotal: dayVisits.length,
        orderValue: dayOrders.reduce((s, o) => s + Number(o.total_amount), 0),
        expenseAmount: dayExpenses.reduce((s, e) => s + Number(e.amount), 0),
      }
    })

    const weekTotals = dailyActivity.reduce(
      (acc, day) => ({
        meetingsCompleted: acc.meetingsCompleted + day.meetingsCompleted,
        meetingsTotal: acc.meetingsTotal + day.meetingsTotal,
        orderValue: acc.orderValue + day.orderValue,
        expenseAmount: acc.expenseAmount + day.expenseAmount,
      }),
      { meetingsCompleted: 0, meetingsTotal: 0, orderValue: 0, expenseAmount: 0 }
    )

    return {
      userId: sub.id,
      userName: sub.name,
      planStatus: plan?.status ?? null,
      planId: plan?.id ?? null,
      dailyActivity,
      weekTotals,
    }
  })

  return NextResponse.json({
    isManager: true,
    weekStart,
    weekEnd,
    teamSize: subordinates.length,
    planStats,
    pendingPlans,
    teamPerformance,
  })
}
