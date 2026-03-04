import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const manager = await requireUser()
  const userId = req.nextUrl.searchParams.get('userId')
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Verify subordinate
  const { data: subordinate } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('manager_user_id', manager.userId)
    .eq('tenant_id', getTenantId())
    .single()

  if (!subordinate) return NextResponse.json({ error: 'Not authorized to view this user' }, { status: 403 })

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', getTenantId())
    .eq('user_id', userId)
    .eq('expense_date', date)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
