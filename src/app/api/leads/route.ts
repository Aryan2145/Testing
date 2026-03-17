import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'view')) return forbidden()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const supabase = createServerSupabase()
  const tid = getTenantId()

  let query = supabase
    .from('business_partners')
    .select('*, districts(name), talukas(name), villages(name)')
    .eq('tenant_id', tid)
    .order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'edit')) return forbidden()
  const {
    name, type, contact_person_name, pincode, gst_number,
    mobile_1, mobile_2, address, description,
    state_id, district_id, taluka_id, village_id,
    latitude, longitude, temperature, next_follow_up_date,
  } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!type?.trim()) return NextResponse.json({ error: 'Type is required' }, { status: 400 })
  if (mobile_1 && !/^\d{10}$/.test(String(mobile_1).trim()))
    return NextResponse.json({ error: 'Mobile Number 1 must be exactly 10 digits' }, { status: 400 })
  if (mobile_2 && !/^\d{10}$/.test(String(mobile_2).trim()))
    return NextResponse.json({ error: 'Mobile Number 2 must be exactly 10 digits' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('business_partners')
    .insert({
      tenant_id: getTenantId(),
      type: type.trim(),
      stage: 'Prospect',
      name: name.trim(),
      contact_person_name: contact_person_name?.trim() || null,
      pincode: pincode?.trim() || null,
      gst_number: gst_number?.trim().toUpperCase() || null,
      mobile_1: mobile_1?.trim() || null,
      mobile_2: mobile_2?.trim() || null,
      address: address || null,
      description: description || null,
      state_id: state_id || null,
      district_id: district_id || null,
      taluka_id: taluka_id || null,
      village_id: village_id || null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      temperature: temperature || null,
      next_follow_up_date: next_follow_up_date || null,
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
