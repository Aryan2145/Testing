import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const viewerId = req.nextUrl.searchParams.get('viewerId')
  if (!viewerId) return NextResponse.json({ error: 'viewerId is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  const { data: rows, error } = await supabase
    .from('user_visibility')
    .select('id, target_user_id')
    .eq('viewer_user_id', viewerId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json([])

  const targetIds = rows.map(r => r.target_user_id)
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('id', targetIds)

  const userMap: Record<string, { name: string }> = {}
  for (const u of users ?? []) {
    userMap[u.id] = { name: u.name }
  }

  const result = rows.map(r => ({
    id: r.id,
    target_user_id: r.target_user_id,
    name: userMap[r.target_user_id]?.name ?? '',
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { viewerId, targetId } = await req.json()
  if (!viewerId || !targetId) return NextResponse.json({ error: 'viewerId and targetId are required' }, { status: 400 })

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  const { error } = await supabase
    .from('user_visibility')
    .upsert({ tenant_id: tenantId, viewer_user_id: viewerId, target_user_id: targetId }, { onConflict: 'viewer_user_id,target_user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'Administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const tenantId = getTenantId()

  const { error } = await supabase
    .from('user_visibility')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
