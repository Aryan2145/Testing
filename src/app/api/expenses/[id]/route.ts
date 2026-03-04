import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', getTenantId())
    .eq('user_id', user.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
