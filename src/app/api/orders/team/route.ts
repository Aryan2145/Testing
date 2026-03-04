import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  // Return current user + their direct reports
  const { data, error } = await supabase
    .from('users')
    .select('id, name')
    .eq('tenant_id', tid)
    .or(`id.eq.${user.userId},manager_user_id.eq.${user.userId}`)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
