import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const state_id = req.nextUrl.searchParams.get('state_id')
  const supabase = createServerSupabase()
  let query = supabase.from('districts').select('*, states(name)').order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  if (state_id) query = query.eq('state_id', Number(state_id))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { name, state_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!state_id) return NextResponse.json({ error: 'State is required' }, { status: 400 })
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('districts')
    .insert({ name: name.trim(), state_id: Number(state_id) })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
