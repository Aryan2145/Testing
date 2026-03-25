import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { classifyUser, computeActivityScore } from '@/lib/usage-intelligence'

async function requireSuperAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SuperAdmin') return null
  return user
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tid = params.id
  const supabase = createServerSupabase()
  const now = new Date()
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ago7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()

  // Parallel fetch all needed data
  const [
    { data: users },
    { data: loginLogs },
    { data: visits },
    { data: orders },
    { data: expenses },
    { data: remarks },
    { data: planLogs },
  ] = await Promise.all([
    supabase.from('users').select('id, name, status').eq('tenant_id', tid),
    supabase.from('user_login_logs').select('user_id, logged_in_at').eq('tenant_id', tid).gte('logged_in_at', ago30),
    supabase.from('daily_visits').select('user_id, created_at, status').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('orders').select('user_id, created_at, total_amount').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('expenses').select('user_id, created_at').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('contextual_remarks').select('author_user_id, created_at').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('weekly_plan_audit_logs').select('actor_user_id, timestamp').eq('tenant_id', tid).eq('action_type', 'submit').gte('timestamp', ago30),
  ])

  const allUsers = users ?? []

  // Build per-user metric maps
  const loginsByUser = new Map<string, string[]>()
  for (const l of loginLogs ?? []) {
    const arr = loginsByUser.get(l.user_id) ?? []
    arr.push(l.logged_in_at)
    loginsByUser.set(l.user_id, arr)
  }

  const activityByUser = new Map<string, { ts: string; weight: number }[]>()
  const addActivity = (uid: string, ts: string, weight: number) => {
    const arr = activityByUser.get(uid) ?? []
    arr.push({ ts, weight })
    activityByUser.set(uid, arr)
  }
  for (const v of visits ?? []) addActivity(v.user_id, v.created_at, v.status === 'Completed' ? 3 : 1)
  for (const o of orders ?? []) addActivity(o.user_id, o.created_at, 3)
  for (const e of expenses ?? []) addActivity(e.user_id, e.created_at, 1)
  for (const r of remarks ?? []) addActivity(r.author_user_id, r.created_at, 1)
  for (const p of planLogs ?? []) addActivity(p.actor_user_id, p.timestamp, 2)

  // Compute per-user classification
  const classMap = new Map<string, string>()
  const scoreMap = new Map<string, number>()
  for (const u of allUsers) {
    const logins = loginsByUser.get(u.id) ?? []
    const activities = activityByUser.get(u.id) ?? []
    const lastLogin = logins.length > 0 ? new Date(Math.max(...logins.map(l => new Date(l).getTime()))) : null
    const score30 = computeActivityScore(activities, ago30)
    const score7  = computeActivityScore(activities, ago7)
    const logins7 = logins.filter(l => l >= ago7).length
    classMap.set(u.id, classifyUser({ status: u.status, lastLogin, score7d: score7, score30d: score30, logins7d: logins7 }))
    scoreMap.set(u.id, score30)
  }

  // Aggregate
  const counts = { actively_using: 0, passive: 0, low_usage: 0, not_using: 0, dormant_enabled: 0 }
  for (const [, cls] of classMap) {
    if (cls in counts) counts[cls as keyof typeof counts]++
  }

  const activeStatus  = allUsers.filter(u => u.status === 'Active').length
  const inactiveStatus = allUsers.filter(u => u.status !== 'Active').length
  const adoptionRate  = allUsers.length > 0 ? Math.round((counts.actively_using / allUsers.length) * 100) : 0

  // Power users: top 10 by score_30d
  const powerUsers = allUsers
    .map(u => ({ id: u.id, name: u.name, score_30d: scoreMap.get(u.id) ?? 0, classification: classMap.get(u.id) ?? 'not_using' }))
    .filter(u => u.score_30d > 0)
    .sort((a, b) => b.score_30d - a.score_30d)
    .slice(0, 10)

  return NextResponse.json({
    total_users:      allUsers.length,
    active_status:    activeStatus,
    inactive_status:  inactiveStatus,
    actively_using:   counts.actively_using,
    passive:          counts.passive,
    low_usage:        counts.low_usage,
    not_using:        counts.not_using,
    dormant_enabled:  counts.dormant_enabled,
    adoption_rate:    adoptionRate,
    power_users:      powerUsers,
  })
}
