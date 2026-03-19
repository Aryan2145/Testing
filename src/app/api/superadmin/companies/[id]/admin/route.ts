import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

async function requireSuperAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SuperAdmin') return null
  return user
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, contact, email, password } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!contact?.trim() || !/^\d{10}$/.test(contact.trim()))
    return NextResponse.json({ error: 'Phone must be exactly 10 digits' }, { status: 400 })
  if (!password?.trim()) return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  const supabase = createServerSupabase()

  // Check phone not already in use
  const { data: existing } = await supabase
    .from('users').select('id').eq('contact', contact.trim()).maybeSingle()
  if (existing) return NextResponse.json({ error: 'This phone number is already in use' }, { status: 400 })

  // Get the L1 level for this tenant
  const { data: level } = await supabase
    .from('levels').select('id').eq('tenant_id', params.id).eq('level_no', 1).maybeSingle()
  if (!level) return NextResponse.json({ error: 'No L1 level found for this company' }, { status: 400 })

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      tenant_id: params.id,
      name: name.trim(),
      contact: contact.trim(),
      email: email?.trim() || null,
      password: password.trim(),
      profile: 'Administrator',
      level_id: level.id,
      status: 'Active',
    })
    .select('id,name,email,contact')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(user, { status: 201 })
}
