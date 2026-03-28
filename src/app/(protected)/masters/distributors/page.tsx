'use client'

import { useState } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'
import { useBPForm, BusinessPartnerFormFields } from '@/components/masters/BusinessPartnerForm'

type DealerRef = { id: string; name: string }

function DealerExpandCell({ dealers }: { dealers: DealerRef[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!dealers || dealers.length === 0)
    return <span className="text-xs text-gray-400 italic">No dealers</span>
  return (
    <div>
      <button
        onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
      >
        {dealers.length} dealer{dealers.length !== 1 ? 's' : ''}
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1 max-w-xs">
          {dealers.map(d => (
            <span key={d.id} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200">{d.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}

const COLS: Column[] = [
  { key: 'name',    label: 'Account Name' },
  { key: 'mobile_1', label: 'Mobile', render: r => String(r.mobile_1 ?? '—') },
  { key: 'place',   label: 'Place', render: r => {
    const dist = (r.districts as { name: string } | null)?.name
    const talu = (r.talukas  as { name: string } | null)?.name
    const vill = (r.villages  as { name: string } | null)?.name
    if (!dist) return <span className="text-gray-400">—</span>
    return <span>{[`District: ${dist}`, talu && `Taluka: ${talu}`, vill && `Village: ${vill}`].filter(Boolean).join(', ')}</span>
  }},
  { key: 'dealers', label: 'Dealers', render: r => <DealerExpandCell dealers={(r.dealers as DealerRef[]) ?? []} /> },
]

export default function DistributorsPage() {
  const crud = useCrud('/api/masters/distributors')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator' || me?.role === 'Superadmin'
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
    const ok = editing ? await crud.update(editing.id as string, bp.buildBody()) : await crud.create(bp.buildBody())
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage title="Distributors" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />

      <Modal title={editing ? 'Edit Distributor' : 'Add Distributor'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        <BusinessPartnerFormFields hook={bp} namePlaceholder="Distributor account name" />
      </Modal>
    </>
  )
}
