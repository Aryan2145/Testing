import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:actor_id(name)')
    .eq('tenant_id', getTenantId())
    .eq('recipient_id', user.userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
