import { NextResponse } from 'next/server'
import { createServerSupabase } from './supabase-server'
import { getTenantId } from './tenant'
import { SessionUser } from './auth'

export type PermSection = 'locations' | 'business' | 'products' | 'organization' | 'users' | 'orders' | 'leads'
export type PermAction = 'view' | 'create' | 'edit' | 'delete'
export type DataScope = 'own' | 'team' | 'all'

export async function checkPermission(
  user: SessionUser,
  section: PermSection,
  action: PermAction
): Promise<boolean> {
  if (user.role === 'Administrator') return true
  const supabase = createServerSupabase()
  const tid = getTenantId()
  const { data } = await supabase
    .from('role_permissions')
    .select('can_view,can_create,can_edit,can_delete')
    .eq('tenant_id', tid)
    .eq('profile', user.role)
    .eq('section', section)
    .maybeSingle()
  if (!data) return false
  switch (action) {
    case 'view':   return data.can_view
    case 'create': return data.can_create ?? data.can_edit
    case 'edit':   return data.can_edit
    case 'delete': return data.can_delete
  }
}

/** Returns the data scope for a user+section pair.
 *  Administrator always gets 'all'. Others read from role_permissions.
 *  Falls back to 'own' if no row found (safe default). */
export async function getDataScope(
  user: SessionUser,
  section: PermSection
): Promise<DataScope> {
  if (user.role === 'Administrator') return 'all'
  const supabase = createServerSupabase()
  const tid = getTenantId()
  const { data } = await supabase
    .from('role_permissions')
    .select('data_scope')
    .eq('tenant_id', tid)
    .eq('profile', user.role)
    .eq('section', section)
    .maybeSingle()
  const scope = data?.data_scope as DataScope | undefined
  return scope ?? 'own'
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
