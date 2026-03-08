import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

type RawRow = Record<string, string | number | null | undefined>

function field(row: RawRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
    if (v !== undefined && v !== null) return String(v).trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'business', 'edit')) return forbidden()
  const body = await req.json() as { rows: RawRow[] }
  if (!Array.isArray(body.rows)) return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
  if (body.rows.length > 2000) return NextResponse.json({ error: 'Maximum 2000 rows per import' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()
  const skipped: { row: number; reason: string }[] = []
  const created = { dealers: 0 }
  const existing = { dealers: 0 }

  const rows = body.rows.map((r, i) => ({
    rowNum: i + 2,
    name:        field(r, 'Name',        'NAME'),
    phone:       field(r, 'Phone',       'PHONE'),
    address:     field(r, 'Address',     'ADDRESS'),
    description: field(r, 'Description', 'DESCRIPTION'),
    district:    field(r, 'District',    'DISTRICT'),
    taluka:      field(r, 'Taluka',      'TALUKA'),
    village:     field(r, 'Village',     'VILLAGE'),
    distributor: field(r, 'Distributor', 'DISTRIBUTOR'),
    latitude:    field(r, 'Latitude',    'LATITUDE'),
    longitude:   field(r, 'Longitude',   'LONGITUDE'),
  }))

  // ── Fetch location lookups ────────────────────────────────────────────────
  const [{ data: allDistricts }, { data: allTalukas }, { data: allVillages }, { data: allDistributors }] = await Promise.all([
    supabase.from('districts').select('id, name, state_id').eq('tenant_id', tid),
    supabase.from('talukas').select('id, name, district_id').eq('tenant_id', tid),
    supabase.from('villages').select('id, name, taluka_id').eq('tenant_id', tid),
    supabase.from('distributors').select('id, name').eq('tenant_id', tid),
  ])
  const districtMap    = new Map(allDistricts?.map(d => [d.name.toLowerCase(), d]) ?? [])
  const talukaMap      = new Map(allTalukas?.map(t => [`${t.district_id}|${t.name.toLowerCase()}`, t.id]) ?? [])
  const villageMap     = new Map(allVillages?.map(v => [`${v.taluka_id}|${v.name.toLowerCase()}`, v.id]) ?? [])
  const distributorMap = new Map(allDistributors?.map(d => [d.name.toLowerCase(), d.id]) ?? [])

  // ── Fetch existing dealers (idempotency — by name within tenant) ──────────
  const { data: existingDealers } = await supabase.from('dealers').select('id, name').eq('tenant_id', tid)
  const existingMap = new Map(existingDealers?.map(d => [d.name.toLowerCase(), d.id]) ?? [])

  const toInsert: Record<string, unknown>[] = []
  const batchNames = new Set<string>()

  for (const r of rows) {
    if (!r.name) { skipped.push({ row: r.rowNum, reason: 'Name is required' }); continue }

    // Dealers require District + Taluka (taluka_id NOT NULL in DB)
    if (!r.district) { skipped.push({ row: r.rowNum, reason: 'District is required for dealers' }); continue }
    if (!r.taluka)   { skipped.push({ row: r.rowNum, reason: 'Taluka is required for dealers' }); continue }

    if (r.phone && !/^\d{10}$/.test(r.phone)) {
      skipped.push({ row: r.rowNum, reason: `Phone "${r.phone}" must be exactly 10 digits` }); continue
    }

    // Idempotency: skip if dealer with same name already exists
    if (existingMap.has(r.name.toLowerCase())) { existing.dealers++; continue }

    // Dedup within this batch
    if (batchNames.has(r.name.toLowerCase())) continue
    batchNames.add(r.name.toLowerCase())

    // ── Resolve place (District + Taluka required) ──────────────────────────
    const dist = districtMap.get(r.district.toLowerCase())
    if (!dist) { skipped.push({ row: r.rowNum, reason: `District "${r.district}" not found` }); continue }
    const district_id = dist.id
    const state_id    = dist.state_id

    const taluka_id = talukaMap.get(`${district_id}|${r.taluka.toLowerCase()}`)
    if (!taluka_id) { skipped.push({ row: r.rowNum, reason: `Taluka "${r.taluka}" not found in District "${r.district}"` }); continue }

    let village_id: string | null = null
    if (r.village) {
      village_id = villageMap.get(`${taluka_id}|${r.village.toLowerCase()}`) ?? null
      if (!village_id) { skipped.push({ row: r.rowNum, reason: `Village "${r.village}" not found in Taluka "${r.taluka}"` }); continue }
    }

    // ── Resolve distributor (optional, by name) ─────────────────────────────
    let distributor_id: string | null = null
    if (r.distributor) {
      distributor_id = distributorMap.get(r.distributor.toLowerCase()) ?? null
      if (!distributor_id) { skipped.push({ row: r.rowNum, reason: `Distributor "${r.distributor}" not found — create it first or import distributors before dealers` }); continue }
    }

    // ── Validate lat/lng ───────────────────────────────────────────────────
    const lat = r.latitude ? parseFloat(r.latitude) : null
    const lng = r.longitude ? parseFloat(r.longitude) : null
    if (r.latitude && (lat === null || isNaN(lat) || lat < -90 || lat > 90)) {
      skipped.push({ row: r.rowNum, reason: `Invalid latitude "${r.latitude}"` }); continue
    }
    if (r.longitude && (lng === null || isNaN(lng) || lng < -180 || lng > 180)) {
      skipped.push({ row: r.rowNum, reason: `Invalid longitude "${r.longitude}"` }); continue
    }

    toInsert.push({
      tenant_id: tid, name: r.name,
      phone: r.phone || null, address: r.address || null, description: r.description || null,
      state_id, district_id, taluka_id, village_id,
      distributor_id,
      latitude: lat, longitude: lng, is_active: true,
    })
  }

  if (toInsert.length > 0) {
    const { data: nd, error } = await supabase.from('dealers').insert(toInsert).select('id')
    if (error) return NextResponse.json({ error: `Dealers: ${error.message}` }, { status: 500 })
    created.dealers = nd?.length ?? 0
  }

  return NextResponse.json({ created, existing, skipped })
}
