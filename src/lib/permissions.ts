import { NextResponse } from 'next/server'
import { createServerSupabase } from './supabase-server'
import { getTenantId } from './tenant'
import { SessionUser } from './auth'

export type PermSection = 'locations' | 'business' | 'products' | 'organization' | 'users'
export type PermAction = 'view' | 'edit' | 'delete'

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
    .select('can_view,can_edit,can_delete')
    .eq('tenant_id', tid)
    .eq('profile', user.role)
    .eq('section', section)
    .maybeSingle()
  if (!data) return false
  return action === 'view' ? data.can_view : action === 'edit' ? data.can_edit : data.can_delete
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
