'use client'

import { useState, useEffect, useRef } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'
import { useBPForm, BusinessPartnerFormFields } from '@/components/masters/BusinessPartnerForm'
import { useToast } from '@/contexts/ToastContext'

const STAGE_COLORS: Record<string, string> = {
  Prospect:    'bg-gray-100 text-gray-600',
  Contacted:   'bg-blue-50 text-blue-700',
  Interested:  'bg-cyan-50 text-cyan-700',
  Qualified:   'bg-indigo-50 text-indigo-700',
  Proposal:    'bg-amber-50 text-amber-700',
  Negotiation: 'bg-orange-50 text-orange-700',
}

const TEMP_COLORS: Record<string, string> = {
  Cold: 'bg-blue-50 text-blue-700',
  Warm: 'bg-amber-50 text-amber-700',
  Hot:  'bg-red-50 text-red-700',
}

const COLS: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type', render: r => r.type
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{r.type as string}</span>
    : <span className="text-gray-400">—</span>
  },
  { key: 'mobile_1', label: 'Mobile', render: r => String(r.mobile_1 ?? '—') },
  { key: 'place', label: 'Place', render: r => {
    const dist = (r.districts as { name: string } | null)?.name
    const talu = (r.talukas  as { name: string } | null)?.name
    if (!dist && !talu) return <span className="text-gray-400">—</span>
    return <span className="text-sm">{[dist && `District: ${dist}`, talu && `Taluka: ${talu}`].filter(Boolean).join(', ')}</span>
  }},
  { key: 'stage', label: 'Stage', render: r => {
    const v = r.stage as string
    if (!v) return <span className="text-gray-400">—</span>
    const cls = STAGE_COLORS[v] ?? 'bg-gray-100 text-gray-600'
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{v}</span>
  }},
  { key: 'temperature', label: 'Temp', render: r => {
    const v = r.temperature as string
    if (!v) return <span className="text-gray-400">—</span>
    const cls = TEMP_COLORS[v] ?? 'bg-gray-100 text-gray-600'
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{v}</span>
  }},
  { key: 'next_follow_up_date', label: 'Follow-up', render: r => {
    const d = r.next_follow_up_date as string | null
    if (!d) return <span className="text-gray-400">—</span>
    return <span className="text-sm">{new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
  }},
  { key: 'created_by', label: 'Created By', render: r => {
    const u = r.created_by as { name: string } | null
    return u ? <span className="text-sm">{u.name}</span> : <span className="text-gray-400">—</span>
  }},
]

export default function LeadsPage() {
  const crud = useCrud('/api/leads')
  const me = useMe()
  const { toast } = useToast()
  const isAdmin = me?.role === 'Administrator' || me?.role === 'Superadmin'
  const canEdit  = isAdmin || (me?.permissions?.business?.edit   ?? false)
  const canDelete = isAdmin || (me?.permissions?.business?.delete ?? false)

  const bp = useBPForm()
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving]   = useState(false)
  const savingRef             = useRef(false)
  const [leadTypes, setLeadTypes] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/masters/lead-types').then(r => r.json()).then(setLeadTypes).catch(() => toast('Failed to load lead types', 'error'))
  }, [toast])

  function openAdd() {
    bp.reset()
    bp.setF('stage')('Prospect')
    setEditing(null); setOpen(true)
  }
  function openEdit(row: Record<string, unknown>) { bp.reset(row); setEditing(row); setOpen(true) }

  async function handleSave() {
    if (savingRef.current) return
    if (!bp.form.name.trim()) return
    if (!bp.validate()) return
    savingRef.current = true
    setSaving(true)
    const body = { ...bp.buildBody(), type: bp.form.type || null }
    const ok = editing ? await crud.update(editing.id as string, body) : await crud.create(body)
    savingRef.current = false
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage
        title="Leads" columns={COLS}
        rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined}
      />

      <Modal title={editing ? 'Edit Lead' : 'Add Lead'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        <BusinessPartnerFormFields
          hook={bp}
          namePlaceholder="Lead / Prospect name"
          showLeadStatus
          topSlot={
            <div>
              <label htmlFor="lead-type" className="block text-sm font-medium text-gray-700 mb-1">Lead Type <span className="text-red-500">*</span></label>
              <select id="lead-type" name="type" value={bp.form.type} onChange={bp.F('type')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Select type…</option>
                {leadTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          }
        />
      </Modal>
    </>
  )
}
