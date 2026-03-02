import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const district_id = req.nextUrl.searchParams.get('district_id')
  const supabase = createServerSupabase()
  let query = supabase.from('talukas').select('*, districts(name)').order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  if (district_id) query = query.eq('district_id', Number(district_id))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { name, district_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!district_id) return NextResponse.json({ error: 'District is required' }, { status: 400 })
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('talukas')
    .insert({ name: name.trim(), district_id: Number(district_id) })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
