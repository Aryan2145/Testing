import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('remark_reads')
    .upsert(
      { tenant_id: getTenantId(), remark_id: params.id, user_id: user.userId },
      { onConflict: 'remark_id,user_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
