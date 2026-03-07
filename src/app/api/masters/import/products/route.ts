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
  const created = { categories: 0, subcategories: 0, products: 0 }
  const existing = { categories: 0, subcategories: 0, products: 0 }

  const rows = body.rows.map((r, i) => ({
    rowNum: i + 2,
    category: field(r, 'Category', 'CATEGORY'),
    subcategory: field(r, 'Sub-Category', 'SUB-CATEGORY', 'Subcategory', 'subcategory'),
    product: field(r, 'Product Name', 'PRODUCT NAME', 'Product', 'product'),
    price: field(r, 'Price', 'PRICE'),
    sku: field(r, 'SKU', 'sku'),
  }))

  // ── 1. CATEGORIES ────────────────────────────────────────────────────────
  const catNames = [...new Set(rows.filter(r => r.category).map(r => r.category))]

  const { data: existingCats } = await supabase
    .from('product_categories').select('id, name').eq('tenant_id', tid)
  const catMap = new Map(existingCats?.map(c => [c.name.toLowerCase(), c.id]) ?? [])

  existing.categories = catNames.filter(n => catMap.has(n.toLowerCase())).length
  const toCreateCats = catNames.filter(n => !catMap.has(n.toLowerCase()))

  if (toCreateCats.length > 0) {
    const { data: nc, error } = await supabase.from('product_categories')
      .insert(toCreateCats.map(name => ({ tenant_id: tid, name, is_active: true })))
      .select('id, name')
    if (error) return NextResponse.json({ error: `Categories: ${error.message}` }, { status: 500 })
    for (const c of nc ?? []) catMap.set(c.name.toLowerCase(), c.id)
    created.categories = nc?.length ?? 0
  }

  // ── 2. SUB-CATEGORIES ────────────────────────────────────────────────────
  const subInputs = [...new Map(
    rows
      .filter(r => r.category && r.subcategory)
      .map(r => {
        const cid = catMap.get(r.category.toLowerCase())
        if (!cid) return null
        return [`${cid}|${r.subcategory.toLowerCase()}`, { name: r.subcategory, categoryId: cid }] as [string, { name: string; categoryId: string }]
      })
      .filter((x): x is [string, { name: string; categoryId: string }] => x !== null)
  ).values()]

  rows.filter(r => r.category && r.subcategory && !catMap.has(r.category.toLowerCase()))
    .forEach(r => skipped.push({ row: r.rowNum, reason: `Category "${r.category}" not found` }))

  const subMap = new Map<string, string>()
  if (subInputs.length > 0) {
    const snames = [...new Set(subInputs.map(s => s.name))]
    const { data: ess } = await supabase.from('product_subcategories')
      .select('id, name, category_id').eq('tenant_id', tid).in('name', snames)
    for (const s of ess ?? []) subMap.set(`${s.category_id}|${s.name.toLowerCase()}`, s.id)
    existing.subcategories = subInputs.filter(s => subMap.has(`${s.categoryId}|${s.name.toLowerCase()}`)).length

    const toCreate = subInputs.filter(s => !subMap.has(`${s.categoryId}|${s.name.toLowerCase()}`))
    if (toCreate.length > 0) {
      const { data: ns, error } = await supabase.from('product_subcategories')
        .insert(toCreate.map(s => ({ tenant_id: tid, name: s.name, category_id: s.categoryId, is_active: true })))
        .select('id, name, category_id')
      if (error) return NextResponse.json({ error: `Sub-categories: ${error.message}` }, { status: 500 })
      for (const s of ns ?? []) subMap.set(`${s.category_id}|${s.name.toLowerCase()}`, s.id)
      created.subcategories = ns?.length ?? 0
    }
  }

  // ── 3. PRODUCTS ──────────────────────────────────────────────────────────
  const prodInputs = rows
    .filter(r => r.category && r.product)
    .map(r => {
      const cid = catMap.get(r.category.toLowerCase())
      if (!cid) return null
      const sid = r.subcategory ? subMap.get(`${cid}|${r.subcategory.toLowerCase()}`) ?? null : null
      const price = r.price ? parseFloat(r.price) : null
      if (r.price && isNaN(price!)) {
        skipped.push({ row: r.rowNum, reason: `Invalid price "${r.price}"` })
        return null
      }
      return { name: r.product, categoryId: cid, subcategoryId: sid, price, sku: r.sku || null }
    })
    .filter((x): x is { name: string; categoryId: string; subcategoryId: string | null; price: number | null; sku: string | null } => x !== null)

  if (prodInputs.length > 0) {
    const pnames = [...new Set(prodInputs.map(p => p.name))]
    const { data: eps } = await supabase.from('products')
      .select('id, name, category_id, subcategory_id').eq('tenant_id', tid).in('name', pnames)
    const prodMap = new Map(eps?.map(p => [
      `${p.category_id}|${p.subcategory_id ?? ''}|${p.name.toLowerCase()}`, p.id
    ]) ?? [])

    existing.products = prodInputs.filter(p =>
      prodMap.has(`${p.categoryId}|${p.subcategoryId ?? ''}|${p.name.toLowerCase()}`)
    ).length

    const toCreate = prodInputs.filter(p =>
      !prodMap.has(`${p.categoryId}|${p.subcategoryId ?? ''}|${p.name.toLowerCase()}`)
    )
    if (toCreate.length > 0) {
      const { data: np, error } = await supabase.from('products')
        .insert(toCreate.map(p => ({
          tenant_id: tid,
          name: p.name,
          category_id: p.categoryId,
          subcategory_id: p.subcategoryId,
          price: p.price,
          sku: p.sku,
          is_active: true,
        })))
        .select('id')
      if (error) return NextResponse.json({ error: `Products: ${error.message}` }, { status: 500 })
      created.products = np?.length ?? 0
    }
  }

  return NextResponse.json({ created, existing, skipped })
}
