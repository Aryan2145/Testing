import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const sessionUser = await requireUser()
  if (!await checkPermission(sessionUser, 'locations', 'view')) return forbidden()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const [{ data: user }, { data: mapping }] = await Promise.all([
    supabase.from('users').select('id, name, contact').eq('id', params.userId).eq('tenant_id', tid).single(),
    supabase.from('user_territory_mappings').select('state_ids, district_ids, taluka_ids, village_ids').eq('user_id', params.userId).eq('tenant_id', tid).maybeSingle(),
  ])

  return NextResponse.json({
    user: user ?? null,
    state_ids: mapping?.state_ids ?? [],
    district_ids: mapping?.district_ids ?? [],
    taluka_ids: mapping?.taluka_ids ?? [],
    village_ids: mapping?.village_ids ?? [],
  })
}

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const user = await requireUser()
  if (!await checkPermission(user, 'locations', 'edit')) return forbidden()
  const { state_ids, district_ids, taluka_ids, village_ids } = await req.json()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { error } = await supabase
    .from('user_territory_mappings')
    .upsert(
      {
        tenant_id: tid,
        user_id: params.userId,
        state_ids: state_ids ?? [],
        district_ids: district_ids ?? [],
        taluka_ids: taluka_ids ?? [],
        village_ids: village_ids ?? [],
      },
      { onConflict: 'tenant_id,user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
