import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { requireUser } from '@/lib/auth'
import { checkPermission, forbidden } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  if (!await checkPermission(user, 'locations', 'view')) return forbidden()
  const supabase = createServerSupabase()
  const tid = getTenantId()

  const [{ data: users }, { data: mappings }] = await Promise.all([
    supabase.from('users').select('id, name, contact').eq('tenant_id', tid).eq('status', 'Active').order('name'),
    supabase.from('user_territory_mappings').select('user_id, state_ids, district_ids').eq('tenant_id', tid),
  ])

  // Collect all district IDs across all mappings
  const allDistrictIds = [...new Set((mappings ?? []).flatMap(m => m.district_ids ?? []))]
  let districtRows: { id: string; name: string; state_id: string }[] = []
  if (allDistrictIds.length > 0) {
    const { data } = await supabase.from('districts').select('id, name, state_id').in('id', allDistrictIds)
    districtRows = data ?? []
  }

  const result = (users ?? []).map(user => {
    const mapping = mappings?.find(m => m.user_id === user.id)
    let district_summary = ''
    if (mapping && (mapping.district_ids ?? []).length > 0) {
      const stateSet = new Set<string>(mapping.state_ids ?? [])
      const activeNames = (mapping.district_ids as string[])
        .map(id => districtRows.find(d => d.id === id))
        .filter(d => d && stateSet.has(d.state_id))
        .map(d => d!.name)
      if (activeNames.length === 0) {
        // Show all saved district names if none active
        const allNames = (mapping.district_ids as string[]).map(id => districtRows.find(d => d.id === id)?.name).filter(Boolean) as string[]
        district_summary = allNames.length <= 3 ? allNames.join(', ') : `${allNames.slice(0, 3).join(', ')} ... +${allNames.length - 3} more`
      } else {
        district_summary = activeNames.length <= 3 ? activeNames.join(', ') : `${activeNames.slice(0, 3).join(', ')} ... +${activeNames.length - 3} more`
      }
    }
    return { ...user, district_summary, has_mapping: !!(mapping && (mapping.district_ids ?? []).length > 0) }
  })

  return NextResponse.json(result)
}
