'use client'

import { useState } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'
import { useBPForm, BusinessPartnerFormFields } from '@/components/masters/BusinessPartnerForm'

const COLS: Column[] = [
  { key: 'name', label: 'Account Name' },
  { key: 'sub_type', label: 'Category', render: r => {
    const v = r.sub_type as string | null
    if (!v) return <span className="text-gray-400">—</span>
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v === 'Institution' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
        {v}
      </span>
    )
  }},
  { key: 'mobile_1', label: 'Mobile', render: r => String(r.mobile_1 ?? '—') },
  { key: 'place', label: 'Place', render: r => {
    const dist = (r.districts as { name: string } | null)?.name
    const talu = (r.talukas  as { name: string } | null)?.name
    const vill = (r.villages  as { name: string } | null)?.name
    if (!dist) return <span className="text-gray-400">—</span>
    return <span>{[`District: ${dist}`, talu && `Taluka: ${talu}`, vill && `Village: ${vill}`].filter(Boolean).join(', ')}</span>
  }},
]

export default function InstitutionsPage() {
  const crud = useCrud('/api/masters/institutions')
  const me = useMe()
  const isAdmin  = me?.role === 'Administrator'
  const canEdit  = isAdmin || (me?.permissions?.business?.edit   ?? false)
  const canDelete = isAdmin || (me?.permissions?.business?.delete ?? false)

  const bp = useBPForm()
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving]   = useState(false)

  function openAdd()  { bp.reset();    setEditing(null); setOpen(true) }
  function openEdit(row: Record<string, unknown>) { bp.reset(row); setEditing(row); setOpen(true) }

  async function handleSave() {
    if (!bp.form.name.trim()) return
    if (!bp.validate()) return
    setSaving(true)
    const body = { ...bp.buildBody(), sub_type: bp.form.sub_type || null }
    const ok = editing ? await crud.update(editing.id as string, body) : await crud.create(body)
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage
        title="Institutions / Consumers" backHref="/masters" columns={COLS}
        rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined}
      />

      <Modal title={editing ? 'Edit Institution / Consumer' : 'Add Institution / Consumer'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        <BusinessPartnerFormFields
          hook={bp}
          namePlaceholder="Institution / Consumer name"
          topSlot={
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
              <select value={bp.form.sub_type} onChange={bp.F('sub_type')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="Institution">Institution</option>
                <option value="Consumer">Consumer</option>
              </select>
            </div>
          }
        />
      </Modal>
    </>
  )
}
