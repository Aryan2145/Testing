import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', params.id)
    .eq('tenant_id', getTenantId())
    .eq('recipient_id', user.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
