import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const supabase = createServerSupabase()
  const tid = getTenantId()
  let query = supabase.from('dealers')
    .select('*, states(name), districts(name), talukas(name), villages(name), distributors(name)')
    .eq('tenant_id', tid).order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { name, state_id, district_id, taluka_id, village_id, distributor_id, phone, address, description, latitude, longitude } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!state_id || !district_id || !taluka_id) return NextResponse.json({ error: 'State, District and Taluka are required' }, { status: 400 })
  if (phone && !/^\d{10}$/.test(String(phone).trim()))
    return NextResponse.json({ error: 'Phone must be exactly 10 digits' }, { status: 400 })
  if (latitude != null && (isNaN(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90))
    return NextResponse.json({ error: 'Latitude must be between -90 and 90' }, { status: 400 })
  if (longitude != null && (isNaN(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))
    return NextResponse.json({ error: 'Longitude must be between -180 and 180' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('dealers').insert({
    name: name.trim(), state_id, district_id, taluka_id,
    village_id: village_id || null, distributor_id: distributor_id || null,
    phone: phone?.trim() || null, address: address || null, description: description || null,
    latitude: latitude != null ? Number(latitude) : null,
    longitude: longitude != null ? Number(longitude) : null,
    tenant_id: getTenantId(),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
