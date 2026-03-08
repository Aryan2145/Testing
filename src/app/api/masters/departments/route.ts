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
  let query = supabase.from('departments').select('*').eq('tenant_id', tid).order('name')
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
  const { data, error } = await supabase
    .from('departments').insert({ name: name.trim(), tenant_id: getTenantId() }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
