import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const taluka_id = req.nextUrl.searchParams.get('taluka_id')
  const supabase = createServerSupabase()
  let query = supabase.from('villages').select('*, talukas(name)').order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  if (taluka_id) query = query.eq('taluka_id', Number(taluka_id))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { name, taluka_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!taluka_id) return NextResponse.json({ error: 'Taluka is required' }, { status: 400 })
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('villages')
    .insert({ name: name.trim(), taluka_id: Number(taluka_id) })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
