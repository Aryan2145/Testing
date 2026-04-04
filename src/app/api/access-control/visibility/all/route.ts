import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  const { data: rows, error } = await supabase
    .from('user_visibility')
    .select('viewer_user_id, target_user_id')
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json([])

  const allIds = [...new Set([...rows.map(r => r.viewer_user_id), ...rows.map(r => r.target_user_id)])]

  const { data: users } = await supabase
    .from('users')
    .select('id, name, manager_user_id')
    .in('id', allIds)

  const userMap: Record<string, { name: string; manager_user_id: string | null }> = {}
  for (const u of users ?? []) {
    userMap[u.id] = {
      name: u.name,
      manager_user_id: u.manager_user_id ?? null,
    }
  }

  const result = rows.map(r => ({
    viewer_user_id: r.viewer_user_id,
    viewer_name: userMap[r.viewer_user_id]?.name ?? '',
    target_user_id: r.target_user_id,
    target_name: userMap[r.target_user_id]?.name ?? '',
    target_manager_user_id: userMap[r.target_user_id]?.manager_user_id ?? null,
  }))

  return NextResponse.json(result)
}
