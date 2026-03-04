import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const contextType = req.nextUrl.searchParams.get('contextType')
  const contextId = req.nextUrl.searchParams.get('contextId')

  if (!contextType || !contextId) {
    return NextResponse.json({ error: 'contextType and contextId are required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('contextual_remarks')
    .select('*, users!author_user_id(id, name)')
    .eq('tenant_id', getTenantId())
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get read status for current user
  const remarkIds = (data ?? []).map(r => r.id)
  let readSet = new Set<string>()
  if (remarkIds.length > 0) {
    const { data: reads } = await supabase
      .from('remark_reads')
      .select('remark_id')
      .eq('user_id', user.userId)
      .in('remark_id', remarkIds)
    readSet = new Set((reads ?? []).map(r => r.remark_id))
  }

  const enriched = (data ?? []).map(r => ({ ...r, is_read: readSet.has(r.id) }))
  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { context_type, context_id, parent_remark_id, body } = await req.json()

  if (!context_type || !context_id || !body?.trim()) {
    return NextResponse.json({ error: 'context_type, context_id and body are required' }, { status: 400 })
  }

  const tenantId = getTenantId()
  const supabase = createServerSupabase()

  const { data: remark, error } = await supabase
    .from('contextual_remarks')
    .insert({
      tenant_id: tenantId,
      context_type,
      context_id,
      parent_remark_id: parent_remark_id ?? null,
      author_user_id: user.userId,
      body: body.trim(),
    })
    .select('*, users!author_user_id(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create notification: find the other party
  // Determine context owner (visit user or expense user) to notify
  try {
    let recipientId: string | null = null
    let redirectPath = ''
    let section: 'meeting' | 'expense' | 'weekly_plan' = 'meeting'
    let message = ''

    if (context_type === 'meeting') {
      const { data: visit } = await supabase.from('daily_visits').select('user_id, visit_date').eq('id', context_id).single()
      if (visit && visit.user_id !== user.userId) {
        // Manager commenting on subordinate's meeting → notify subordinate
        recipientId = visit.user_id
        redirectPath = `/daily-activity?date=${visit.visit_date}&remarks=${context_id}`
        section = 'meeting'
        message = `New remark on your meeting from ${user.name}`
      } else if (visit && visit.user_id === user.userId) {
        // Subordinate commenting on own meeting → notify manager, redirect to review page
        const { data: me } = await supabase.from('users').select('manager_user_id').eq('id', user.userId).single()
        if (me?.manager_user_id) {
          recipientId = me.manager_user_id
          redirectPath = `/review/${user.userId}?tab=activity&remarks=${context_id}`
          section = 'meeting'
          message = `${user.name} added a remark on their meeting`
        }
      }
    } else if (context_type === 'expense') {
      const { data: expense } = await supabase.from('expenses').select('user_id, expense_date').eq('id', context_id).single()
      if (expense && expense.user_id !== user.userId) {
        // Manager commenting on subordinate's expense → notify subordinate
        recipientId = expense.user_id
        redirectPath = `/daily-activity?date=${expense.expense_date}&remarks=${context_id}&tab=expenses`
        section = 'expense'
        message = `New remark on your expense from ${user.name}`
      } else if (expense && expense.user_id === user.userId) {
        // Subordinate commenting on own expense → notify manager, redirect to review page
        const { data: me } = await supabase.from('users').select('manager_user_id').eq('id', user.userId).single()
        if (me?.manager_user_id) {
          recipientId = me.manager_user_id
          redirectPath = `/review/${user.userId}?tab=expenses&remarks=${context_id}`
          section = 'expense'
          message = `${user.name} added a remark on their expense`
        }
      }
    } else if (context_type === 'weekly_plan_day') {
      const { data: item } = await supabase.from('weekly_plan_items').select('weekly_plan_id, plan_date').eq('id', context_id).single()
      if (item) {
        const { data: plan } = await supabase.from('weekly_plans').select('user_id').eq('id', item.weekly_plan_id).single()
        if (plan && plan.user_id !== user.userId) {
          recipientId = plan.user_id
          redirectPath = `/weekly-plan?remarks=${context_id}`
          section = 'weekly_plan'
          message = `New remark on your weekly plan from ${user.name}`
        } else if (plan && plan.user_id === user.userId) {
          const { data: me } = await supabase.from('users').select('manager_user_id').eq('id', user.userId).single()
          if (me?.manager_user_id) {
            recipientId = me.manager_user_id
            redirectPath = `/weekly-plan?remarks=${context_id}`
            section = 'weekly_plan'
            message = `${user.name} added a remark on their weekly plan`
          }
        }
      }
    }

    if (recipientId) {
      await supabase.from('notifications').insert({
        tenant_id: tenantId,
        recipient_id: recipientId,
        actor_id: user.userId,
        section,
        context_type,
        context_id,
        remark_id: remark.id,
        redirect_path: redirectPath,
        message,
      })
    }
  } catch {
    // Notification failure is non-fatal
  }

  return NextResponse.json({ ...remark, is_read: false }, { status: 201 })
}
