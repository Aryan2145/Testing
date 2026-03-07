import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

type RawRow = Record<string, string | number | null | undefined>

function field(row: RawRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
    if (v !== undefined && v !== null) return String(v).trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  await requireUser()
  const body = await req.json() as { rows: RawRow[] }
  if (!Array.isArray(body.rows)) return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
  if (body.rows.length > 2000) return NextResponse.json({ error: 'Maximum 2000 rows per import' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const skipped: { row: number; reason: string }[] = []
  const created = { states: 0, districts: 0, talukas: 0, villages: 0 }
  const existing = { states: 0, districts: 0, talukas: 0, villages: 0 }

  // Normalize all rows
  const rows = body.rows.map((r, i) => ({
    rowNum: i + 2,
    state: field(r, 'State', 'STATE'),
    district: field(r, 'District', 'DISTRICT'),
    taluka: field(r, 'Taluka', 'TALUKA'),
    village: field(r, 'Village', 'VILLAGE'),
  }))

  // ── 1. STATES ────────────────────────────────────────────────────────────
  const stateNames = [...new Set(rows.filter(r => r.state).map(r => r.state))]

  const { data: existingStates } = await supabase
    .from('states').select('id, name').eq('tenant_id', tid)
  const stateMap = new Map(existingStates?.map(s => [s.name.toLowerCase(), s.id]) ?? [])

  existing.states = stateNames.filter(n => stateMap.has(n.toLowerCase())).length
  const toCreateStates = stateNames.filter(n => !stateMap.has(n.toLowerCase()))

  if (toCreateStates.length > 0) {
    const { data: ns, error } = await supabase.from('states')
      .insert(toCreateStates.map(name => ({ tenant_id: tid, name, is_active: true })))
      .select('id, name')
    if (error) return NextResponse.json({ error: `States: ${error.message}` }, { status: 500 })
    for (const s of ns ?? []) stateMap.set(s.name.toLowerCase(), s.id)
    created.states = ns?.length ?? 0
  }

  // ── 2. DISTRICTS ─────────────────────────────────────────────────────────
  const districtInputs = [...new Map(
    rows
      .filter(r => r.state && r.district)
      .map(r => {
        const sid = stateMap.get(r.state.toLowerCase())
        if (!sid) return null
        return [`${sid}|${r.district.toLowerCase()}`, { name: r.district, stateId: sid }] as [string, { name: string; stateId: string }]
      })
      .filter((x): x is [string, { name: string; stateId: string }] => x !== null)
  ).values()]

  rows.filter(r => r.state && r.district && !stateMap.has(r.state.toLowerCase()))
    .forEach(r => skipped.push({ row: r.rowNum, reason: `State "${r.state}" not found` }))

  const districtMap = new Map<string, string>()
  if (districtInputs.length > 0) {
    const dnames = [...new Set(districtInputs.map(d => d.name))]
    const { data: eds } = await supabase.from('districts')
      .select('id, name, state_id').eq('tenant_id', tid).in('name', dnames)
    for (const d of eds ?? []) districtMap.set(`${d.state_id}|${d.name.toLowerCase()}`, d.id)
    existing.districts = districtInputs.filter(d => districtMap.has(`${d.stateId}|${d.name.toLowerCase()}`)).length

    const toCreate = districtInputs.filter(d => !districtMap.has(`${d.stateId}|${d.name.toLowerCase()}`))
    if (toCreate.length > 0) {
      const { data: nd, error } = await supabase.from('districts')
        .insert(toCreate.map(d => ({ tenant_id: tid, name: d.name, state_id: d.stateId, is_active: true })))
        .select('id, name, state_id')
      if (error) return NextResponse.json({ error: `Districts: ${error.message}` }, { status: 500 })
      for (const d of nd ?? []) districtMap.set(`${d.state_id}|${d.name.toLowerCase()}`, d.id)
      created.districts = nd?.length ?? 0
    }
  }

  // ── 3. TALUKAS ───────────────────────────────────────────────────────────
  const talukaInputs = [...new Map(
    rows
      .filter(r => r.state && r.district && r.taluka)
      .map(r => {
        const sid = stateMap.get(r.state.toLowerCase())
        const did = sid ? districtMap.get(`${sid}|${r.district.toLowerCase()}`) : undefined
        if (!did) return null
        return [`${did}|${r.taluka.toLowerCase()}`, { name: r.taluka, districtId: did }] as [string, { name: string; districtId: string }]
      })
      .filter((x): x is [string, { name: string; districtId: string }] => x !== null)
  ).values()]

  const talukaMap = new Map<string, string>()
  if (talukaInputs.length > 0) {
    const tnames = [...new Set(talukaInputs.map(t => t.name))]
    const { data: ets } = await supabase.from('talukas')
      .select('id, name, district_id').eq('tenant_id', tid).in('name', tnames)
    for (const t of ets ?? []) talukaMap.set(`${t.district_id}|${t.name.toLowerCase()}`, t.id)
    existing.talukas = talukaInputs.filter(t => talukaMap.has(`${t.districtId}|${t.name.toLowerCase()}`)).length

    const toCreate = talukaInputs.filter(t => !talukaMap.has(`${t.districtId}|${t.name.toLowerCase()}`))
    if (toCreate.length > 0) {
      const { data: nt, error } = await supabase.from('talukas')
        .insert(toCreate.map(t => ({ tenant_id: tid, name: t.name, district_id: t.districtId, is_active: true })))
        .select('id, name, district_id')
      if (error) return NextResponse.json({ error: `Talukas: ${error.message}` }, { status: 500 })
      for (const t of nt ?? []) talukaMap.set(`${t.district_id}|${t.name.toLowerCase()}`, t.id)
      created.talukas = nt?.length ?? 0
    }
  }

  // ── 4. VILLAGES ──────────────────────────────────────────────────────────
  const villageInputs = [...new Map(
    rows
      .filter(r => r.state && r.district && r.taluka && r.village)
      .map(r => {
        const sid = stateMap.get(r.state.toLowerCase())
        const did = sid ? districtMap.get(`${sid}|${r.district.toLowerCase()}`) : undefined
        const tid2 = did ? talukaMap.get(`${did}|${r.taluka.toLowerCase()}`) : undefined
        if (!tid2) return null
        return [`${tid2}|${r.village.toLowerCase()}`, { name: r.village, talukaId: tid2 }] as [string, { name: string; talukaId: string }]
      })
      .filter((x): x is [string, { name: string; talukaId: string }] => x !== null)
  ).values()]

  if (villageInputs.length > 0) {
    const vnames = [...new Set(villageInputs.map(v => v.name))]
    const { data: evs } = await supabase.from('villages')
      .select('id, name, taluka_id').eq('tenant_id', tid).in('name', vnames)
    const villageMap = new Map(evs?.map(v => [`${v.taluka_id}|${v.name.toLowerCase()}`, v.id]) ?? [])
    existing.villages = villageInputs.filter(v => villageMap.has(`${v.talukaId}|${v.name.toLowerCase()}`)).length

    const toCreate = villageInputs.filter(v => !villageMap.has(`${v.talukaId}|${v.name.toLowerCase()}`))
    if (toCreate.length > 0) {
      const { data: nv, error } = await supabase.from('villages')
        .insert(toCreate.map(v => ({ tenant_id: tid, name: v.name, taluka_id: v.talukaId, is_active: true })))
        .select('id')
      if (error) return NextResponse.json({ error: `Villages: ${error.message}` }, { status: 500 })
      created.villages = nv?.length ?? 0
    }
  }

  return NextResponse.json({ created, existing, skipped })
}
