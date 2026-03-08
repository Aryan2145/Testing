import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'

const SECTIONS = ['locations', 'business', 'products', 'organization', 'users'] as const
type Section = typeof SECTIONS[number]
type SectionPerm = { view: boolean; edit: boolean; delete: boolean }
type Permissions = Record<Section, SectionPerm>

const allTrue: Permissions = SECTIONS.reduce(
  (acc, s) => ({ ...acc, [s]: { view: true, edit: true, delete: true } }),
  {} as Permissions
)
const allFalse: Permissions = SECTIONS.reduce(
  (acc, s) => ({ ...acc, [s]: { view: false, edit: false, delete: false } }),
  {} as Permissions
)

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()

  if (user.role === 'Administrator') {
    if (!user.userId) return NextResponse.json({ ...user, hasSubordinates: false, permissions: allTrue })
    const { count } = await supabase
      .from('user_visibility')
      .select('id', { count: 'exact', head: true })
      .eq('viewer_user_id', user.userId)
    return NextResponse.json({ ...user, hasSubordinates: (count ?? 0) > 0, permissions: allTrue })
  }

  // Standard user — fetch hasSubordinates and role_permissions in parallel
  const tid = getTenantId()
  const [visResult, permResult] = await Promise.all([
    user.userId
      ? supabase.from('user_visibility').select('id', { count: 'exact', head: true }).eq('viewer_user_id', user.userId)
      : Promise.resolve({ count: 0 }),
    supabase
      .from('role_permissions')
      .select('section, can_view, can_edit, can_delete')
      .eq('tenant_id', tid)
      .eq('profile', user.role),
  ])

  const permissions: Permissions = { ...allFalse }
  for (const row of (permResult as { data: { section: string; can_view: boolean; can_edit: boolean; can_delete: boolean }[] | null }).data ?? []) {
    if ((SECTIONS as readonly string[]).includes(row.section)) {
      permissions[row.section as Section] = {
        view: row.can_view,
        edit: row.can_edit,
        delete: row.can_delete,
      }
    }
  }

  return NextResponse.json({
    ...user,
    hasSubordinates: ((visResult as { count: number | null }).count ?? 0) > 0,
    permissions,
  })
}
