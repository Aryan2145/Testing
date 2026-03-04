import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', getTenantId())
    .eq('user_id', user.userId)
    .eq('expense_date', date)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { expense_date, category, amount, notes } = await req.json()
  if (!expense_date || !category || !amount) {
    return NextResponse.json({ error: 'expense_date, category and amount are required' }, { status: 400 })
  }
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      tenant_id: getTenantId(),
      user_id: user.userId,
      expense_date,
      category,
      amount: Number(amount),
      notes: notes ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
