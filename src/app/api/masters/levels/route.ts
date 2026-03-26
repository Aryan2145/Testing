import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'organization', 'view')) return forbidden()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const supabase = createServerSupabase()
  const tid = getTenantId()
  let query = supabase.from('levels').select('*').eq('tenant_id', tid).order('level_no')
  if (q) query = query.ilike('name', `%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'organization', 'edit')) return forbidden()
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Enforce sequential level numbers — auto-assign next
  const { data: existing } = await supabase
    .from('levels').select('level_no').eq('tenant_id', tid).order('level_no', { ascending: false }).limit(1)
  const nextLevelNo = (existing?.[0]?.level_no ?? 0) + 1

  const { data, error } = await supabase
    .from('levels').insert({ name: name.trim(), level_no: nextLevelNo, tenant_id: tid }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
