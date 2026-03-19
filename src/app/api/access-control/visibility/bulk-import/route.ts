import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export async function POST() {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  const { data: users, error } = await supabase
    .from('users')
    .select('id, manager_user_id')
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!users?.length) return NextResponse.json({ inserted: 0 })

  // Build manager lookup map
  const managerMap: Record<string, string | null> = {}
  for (const u of users) managerMap[u.id] = u.manager_user_id ?? null

  // For each user, walk up the ancestor chain and create visibility rows
  const rowSet = new Set<string>()
  const rows: { tenant_id: string; viewer_user_id: string; target_user_id: string }[] = []

  for (const u of users) {
    if (!u.manager_user_id) continue
    let currentId: string | null = u.manager_user_id
    const visited = new Set<string>()

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const key = `${currentId}:${u.id}`
      if (!rowSet.has(key)) {
        rowSet.add(key)
        rows.push({ tenant_id: tenantId, viewer_user_id: currentId, target_user_id: u.id })
      }
      currentId = managerMap[currentId] ?? null
    }
  }

  if (!rows.length) return NextResponse.json({ inserted: 0 })

  const { error: insertError } = await supabase
    .from('user_visibility')
    .upsert(rows, { onConflict: 'tenant_id,viewer_user_id,target_user_id', ignoreDuplicates: true })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json({ inserted: rows.length })
}
