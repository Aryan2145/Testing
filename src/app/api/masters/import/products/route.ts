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

// Case-insensitive dedup: keeps first-seen casing, discards subsequent variants
function uniqueByLower(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n) }
  }
  return out
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
    category:    field(r, 'Category',     'CATEGORY'),
    subcategory: field(r, 'Sub-Category', 'SUB-CATEGORY', 'Subcategory', 'subcategory'),
    product:     field(r, 'Product Name', 'PRODUCT NAME', 'Product',     'product'),
    price:       field(r, 'Price',        'PRICE'),
    sku:         field(r, 'SKU',          'sku'),
  }))

  // ── 1. CATEGORIES ────────────────────────────────────────────────────────
  // Case-insensitive dedup of input names
  const catNames = uniqueByLower(rows.filter(r => r.category).map(r => r.category))

  // Fetch ALL categories for tenant → case-insensitive map
  const { data: existingCats } = await supabase
    .from('product_categories').select('id, name').eq('tenant_id', tid)
  const catMap = new Map<string, string>(existingCats?.map(c => [c.name.toLowerCase(), c.id]) ?? [])

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
  // Deduplicate inputs by compound key (categoryId|sub.lower), keep first-seen casing
  const subInputsMap = new Map<string, { name: string; categoryId: string }>()
  const skippedCatKeys = new Set<string>()
  for (const r of rows) {
    if (!r.category || !r.subcategory) continue
    const cid = catMap.get(r.category.toLowerCase())
    if (!cid) {
      if (!skippedCatKeys.has(r.category.toLowerCase())) {
        skipped.push({ row: r.rowNum, reason: `Category "${r.category}" not found` })
        skippedCatKeys.add(r.category.toLowerCase())
      }
      continue
    }
    const key = `${cid}|${r.subcategory.toLowerCase()}`
    if (!subInputsMap.has(key)) subInputsMap.set(key, { name: r.subcategory, categoryId: cid })
  }
  const subInputs = [...subInputsMap.values()]

  const subMap = new Map<string, string>()
  if (subInputs.length > 0) {
    // Fetch ALL subcategories for the relevant categories (avoids case-sensitive .in('name'))
    const relevantCatIds = [...new Set(subInputs.map(s => s.categoryId))]
    const { data: ess } = await supabase.from('product_subcategories')
      .select('id, name, category_id').eq('tenant_id', tid).in('category_id', relevantCatIds)
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
  // Deduplicate by compound key (categoryId|subcategoryId|product.lower)
  const prodInputsMap = new Map<string, { name: string; categoryId: string; subcategoryId: string | null; price: number | null; sku: string | null }>()
  for (const r of rows) {
    if (!r.category || !r.product) continue
    const cid = catMap.get(r.category.toLowerCase())
    if (!cid) continue
    const sid = r.subcategory ? (subMap.get(`${cid}|${r.subcategory.toLowerCase()}`) ?? null) : null
    const price = r.price ? parseFloat(r.price) : null
    if (r.price && isNaN(price!)) {
      skipped.push({ row: r.rowNum, reason: `Invalid price "${r.price}"` })
      continue
    }
    const key = `${cid}|${sid ?? ''}|${r.product.toLowerCase()}`
    if (!prodInputsMap.has(key)) {
      prodInputsMap.set(key, { name: r.product, categoryId: cid, subcategoryId: sid, price, sku: r.sku || null })
    }
  }
  const prodInputs = [...prodInputsMap.values()]

  if (prodInputs.length > 0) {
    // Fetch ALL products for the relevant categories (avoids case-sensitive .in('name'))
    const relevantCatIds = [...new Set(prodInputs.map(p => p.categoryId))]
    const { data: eps } = await supabase.from('products')
      .select('id, name, category_id, subcategory_id').eq('tenant_id', tid).in('category_id', relevantCatIds)
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
