import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'products', 'view')) return forbidden()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const categoryId = req.nextUrl.searchParams.get('categoryId')
  const supabase = createServerSupabase()
  const tid = getTenantId()
  let query = supabase.from('products')
    .select('*, product_categories(name), product_subcategories(name)')
    .eq('tenant_id', tid).order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!await checkPermission(user, 'products', 'edit')) return forbidden()
  const { name, category_id, subcategory_id, price, sku } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!category_id) return NextResponse.json({ error: 'Category is required' }, { status: 400 })
  if (!subcategory_id) return NextResponse.json({ error: 'Subcategory is required' }, { status: 400 })
  if (price == null || isNaN(Number(price))) return NextResponse.json({ error: 'Valid price is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data: sub } = await supabase
    .from('product_subcategories').select('category_id').eq('id', subcategory_id).single()
  if (!sub || sub.category_id !== category_id) {
    return NextResponse.json({ error: 'Subcategory does not belong to selected category' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('products').insert({ name: name.trim(), category_id, subcategory_id, price: Number(price), sku: sku || null, tenant_id: getTenantId() }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
