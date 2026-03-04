import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const params = req.nextUrl.searchParams
  const section = params.get('section') ?? ''
  const filterUserId = params.get('userId') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const status = params.get('status') ?? 'all'

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  // Get all remarks where current user is author or in same context
  let query = supabase
    .from('contextual_remarks')
    .select('id, context_type, context_id, author_user_id, body, created_at, updated_at, author:users!author_user_id(id, name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (filterUserId) query = query.eq('author_user_id', filterUserId)

  const { data: remarks, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by (context_type, context_id)
  const groups: Record<string, {
    context_type: string
    context_id: string
    last_remark: string
    last_body: string
    last_author: string
    count: number
    updated_at: string
  }> = {}

  for (const r of remarks ?? []) {
    const key = `${r.context_type}::${r.context_id}`
    if (!groups[key]) {
      groups[key] = {
        context_type: r.context_type,
        context_id: r.context_id,
        last_remark: r.id,
        last_body: r.body,
        last_author: ((r.author as unknown) as { name: string } | null)?.name ?? '',
        count: 1,
        updated_at: r.created_at,
      }
    } else {
      groups[key].count++
      if (r.created_at > groups[key].updated_at) {
        groups[key].updated_at = r.created_at
        groups[key].last_body = r.body
        groups[key].last_author = ((r.author as unknown) as { name: string } | null)?.name ?? ''
      }
    }
  }

  // Get unread counts per context for current user
  const remarkIds = (remarks ?? []).map(r => r.id)
  let readSet = new Set<string>()
  if (remarkIds.length > 0) {
    const { data: reads } = await supabase
      .from('remark_reads')
      .select('remark_id')
      .eq('user_id', user.userId)
      .in('remark_id', remarkIds)
    readSet = new Set((reads ?? []).map(r => r.remark_id))
  }

  const unreadByContext: Record<string, number> = {}
  for (const r of remarks ?? []) {
    if (!readSet.has(r.id)) {
      const key = `${r.context_type}::${r.context_id}`
      unreadByContext[key] = (unreadByContext[key] ?? 0) + 1
    }
  }

  let conversations = Object.values(groups).map(g => ({
    ...g,
    unread_count: unreadByContext[`${g.context_type}::${g.context_id}`] ?? 0,
  }))

  // Filter by status
  if (status === 'unread') conversations = conversations.filter(c => c.unread_count > 0)
  else if (status === 'read') conversations = conversations.filter(c => c.unread_count === 0)

  // Filter by section
  if (section) {
    const sectionMap: Record<string, string[]> = {
      meeting: ['meeting'],
      expense: ['expense'],
      weekly_plan: ['weekly_plan_day'],
    }
    const types = sectionMap[section] ?? [section]
    conversations = conversations.filter(c => types.includes(c.context_type))
  }

  conversations.sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return NextResponse.json(conversations)
}
