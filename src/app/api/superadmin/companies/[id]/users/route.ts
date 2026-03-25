import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { classifyUser, computeActivityScore } from '@/lib/usage-intelligence'

async function requireSuperAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SuperAdmin') return null
  return user
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tid = params.id
  const { searchParams } = new URL(req.url)
  const page           = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit          = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
  const search         = (searchParams.get('search') ?? '').toLowerCase().trim()
  const filterCls      = searchParams.get('classification') ?? ''
  const sortBy         = searchParams.get('sort') ?? 'last_login'
  const sortOrder      = searchParams.get('order') === 'asc' ? 1 : -1

  const supabase = createServerSupabase()
  const now = new Date()
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ago14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const ago7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()

  // Parallel fetch all data for this tenant (30-day window for activity)
  const [
    { data: allUsers },
    { data: loginLogs },
    { data: visits },
    { data: orders },
    { data: expenses },
    { data: remarks },
    { data: planLogs },
  ] = await Promise.all([
    supabase.from('users').select('id, name, contact, email, status, profile, level_id, created_at').eq('tenant_id', tid).order('name'),
    supabase.from('user_login_logs').select('user_id, logged_in_at').eq('tenant_id', tid).gte('logged_in_at', ago30),
    supabase.from('daily_visits').select('user_id, created_at, status').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('orders').select('user_id, created_at, total_amount').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('expenses').select('user_id, created_at, amount').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('contextual_remarks').select('author_user_id, created_at').eq('tenant_id', tid).gte('created_at', ago30),
    supabase.from('weekly_plan_audit_logs').select('actor_user_id, timestamp').eq('tenant_id', tid).eq('action_type', 'submit').gte('timestamp', ago30),
  ])

  if (!allUsers) return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })

  // Build login maps
  const loginsByUser = new Map<string, string[]>()
  for (const l of loginLogs ?? []) {
    const arr = loginsByUser.get(l.user_id) ?? []
    arr.push(l.logged_in_at)
    loginsByUser.set(l.user_id, arr)
  }

  // Build activity maps with weights
  type ActivityEntry = { ts: string; weight: number; type: string }
  const activityByUser = new Map<string, ActivityEntry[]>()
  const addActivity = (uid: string, ts: string, weight: number, type: string) => {
    const arr = activityByUser.get(uid) ?? []
    arr.push({ ts, weight, type })
    activityByUser.set(uid, arr)
  }
  // Meetings: completed=3pts, created=1pt
  for (const v of visits ?? [])   addActivity(v.user_id, v.created_at, v.status === 'Completed' ? 3 : 1, 'meeting')
  // Orders=3pts, Expenses=1pt, Remarks=1pt, Plan submit=2pts
  for (const o of orders ?? [])   addActivity(o.user_id, o.created_at, 3, 'order')
  for (const e of expenses ?? []) addActivity(e.user_id, e.created_at, 1, 'expense')
  for (const r of remarks ?? [])  addActivity(r.author_user_id, r.created_at, 1, 'remark')
  for (const p of planLogs ?? []) addActivity(p.actor_user_id, p.timestamp, 2, 'plan')

  // Compute per-user enriched metrics
  const enriched = allUsers.map(u => {
    const logins   = loginsByUser.get(u.id) ?? []
    const activity = activityByUser.get(u.id) ?? []

    const lastLoginTs = logins.length > 0 ? logins.reduce((a, b) => a > b ? a : b) : null
    const lastActivityTs = activity.length > 0 ? activity.reduce((a, b) => a.ts > b.ts ? a : b).ts : null

    const logins7d  = logins.filter(l => l >= ago7).length
    const logins30d = logins.length

    const score7d  = computeActivityScore(activity, ago7)
    const score14d = computeActivityScore(activity, ago14)
    const score30d = computeActivityScore(activity, ago30)

    // Per-feature counts
    const meetings30d  = activity.filter(a => a.type === 'meeting' && a.ts >= ago30)
    const meetingsCompleted30d = (visits ?? []).filter(v => v.user_id === u.id && v.status === 'Completed' && v.created_at >= ago30).length
    const orders30d    = activity.filter(a => a.type === 'order'   && a.ts >= ago30).length
    const ordersValue30d = (orders ?? []).filter(o => o.user_id === u.id && o.created_at >= ago30).reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
    const expenses30d  = activity.filter(a => a.type === 'expense' && a.ts >= ago30).length
    const plans30d     = activity.filter(a => a.type === 'plan'    && a.ts >= ago30).length
    const remarks30d   = activity.filter(a => a.type === 'remark'  && a.ts >= ago30).length

    const lastLogin = lastLoginTs ? new Date(lastLoginTs) : null
    const classification = classifyUser({
      status: u.status,
      lastLogin,
      score7d,
      score30d,
      logins7d,
    })

    return {
      id:           u.id,
      name:         u.name,
      contact:      u.contact,
      email:        u.email,
      status:       u.status,
      profile:      u.profile,
      last_login:   lastLoginTs,
      logins_7d:    logins7d,
      logins_30d:   logins30d,
      last_activity: lastActivityTs,
      activity_score_7d:  score7d,
      activity_score_14d: score14d,
      activity_score_30d: score30d,
      meetings_30d:           meetings30d.length,
      meetings_completed_30d: meetingsCompleted30d,
      orders_30d:             orders30d,
      orders_value_30d:       Math.round(ordersValue30d),
      expenses_30d:           expenses30d,
      plans_submitted_30d:    plans30d,
      remarks_30d:            remarks30d,
      classification,
    }
  })

  // Filter
  let filtered = enriched
  if (search) {
    filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(search) ||
      u.contact.includes(search) ||
      (u.email ?? '').toLowerCase().includes(search)
    )
  }
  if (filterCls) {
    filtered = filtered.filter(u => u.classification === filterCls)
  }

  // Sort
  const SORT_KEYS: Record<string, (u: typeof enriched[0]) => number | string> = {
    name:          u => u.name,
    last_login:    u => u.last_login ?? '',
    last_activity: u => u.last_activity ?? '',
    score_30d:     u => u.activity_score_30d,
    logins_30d:    u => u.logins_30d,
    orders_value:  u => u.orders_value_30d,
  }
  const sortFn = SORT_KEYS[sortBy] ?? SORT_KEYS.last_login
  filtered.sort((a, b) => {
    const av = sortFn(a), bv = sortFn(b)
    if (av < bv) return -1 * sortOrder
    if (av > bv) return  1 * sortOrder
    return 0
  })

  // Paginate
  const total = filtered.length
  const items = filtered.slice((page - 1) * limit, page * limit)

  return NextResponse.json({ total, page, limit, items })
}
