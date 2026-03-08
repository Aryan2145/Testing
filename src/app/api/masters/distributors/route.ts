import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'view')) return forbidden()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const supabase = createServerSupabase()
  const tid = getTenantId()
  let query = supabase.from('distributors').select('*, states(name), districts(name), talukas(name), villages(name), dealers(id, name)').eq('tenant_id', tid).order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'edit')) return forbidden()
  const { name, phone, address, description, state_id, district_id, taluka_id, village_id, latitude, longitude } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (phone && !/^\d{10}$/.test(String(phone).trim()))
    return NextResponse.json({ error: 'Phone must be exactly 10 digits' }, { status: 400 })
  if (latitude != null && (isNaN(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90))
    return NextResponse.json({ error: 'Latitude must be between -90 and 90' }, { status: 400 })
  if (longitude != null && (isNaN(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))
    return NextResponse.json({ error: 'Longitude must be between -180 and 180' }, { status: 400 })
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('distributors').insert({ name: name.trim(), phone: phone?.trim() || null, address: address || null, description: description || null, state_id: state_id || null, district_id: district_id || null, taluka_id: taluka_id || null, village_id: village_id || null, latitude: latitude != null ? Number(latitude) : null, longitude: longitude != null ? Number(longitude) : null, tenant_id: getTenantId() }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
