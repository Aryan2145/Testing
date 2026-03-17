'use client'

import { useState, useEffect, useMemo } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'
import { useBPForm, BusinessPartnerFormFields } from '@/components/masters/BusinessPartnerForm'

const PAGE_SIZE = 15

const COLS: Column[] = [
  { key: 'name', label: 'Account Name' },
  { key: 'place', label: 'Place', render: r => {
    const dist = (r.districts as { name: string } | null)?.name
    const talu = (r.talukas  as { name: string } | null)?.name
    const vill = (r.villages  as { name: string } | null)?.name
    if (!dist) return <span className="text-gray-400">—</span>
    return <span>{[`District: ${dist}`, talu && `Taluka: ${talu}`, vill && `Village: ${vill}`].filter(Boolean).join(', ')}</span>
  }},
  { key: 'distributor', label: 'Distributor', render: r => {
    const name = (r.distributors as { name: string } | null)?.name
    if (!name) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        Unassigned
      </span>
    )
    return <span className="text-sm text-gray-700">{name}</span>
  }},
]

type Opt = { value: string; label: string }

export default function DealersPage() {
  const crud = useCrud('/api/masters/dealers')
  const me = useMe()
  const isAdmin  = me?.role === 'Administrator'
  const canEdit  = isAdmin || (me?.permissions?.business?.edit   ?? false)
  const canDelete = isAdmin || (me?.permissions?.business?.delete ?? false)

  // ── Unassigned filter ────────────────────────────────────────────────────────
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [filterPage, setFilterPage] = useState(1)
  const unassignedRows      = useMemo(() => crud.allRows.filter(r => !r.distributor_id), [crud.allRows])
  const unassignedPageRows  = useMemo(() => unassignedRows.slice((filterPage - 1) * PAGE_SIZE, filterPage * PAGE_SIZE), [unassignedRows, filterPage])
  const unassignedTotalPages = Math.max(1, Math.ceil(unassignedRows.length / PAGE_SIZE))
  const displayRows       = showUnassigned ? unassignedPageRows  : crud.rows
  const displayPage       = showUnassigned ? filterPage          : crud.page
  const displayTotalPages = showUnassigned ? unassignedTotalPages : crud.totalPages
  const displayOnPage     = showUnassigned ? setFilterPage        : crud.setPage
  const displayCount      = showUnassigned ? unassignedRows.length : crud.allRows.length

  // ── Dealer modal ─────────────────────────────────────────────────────────────
  const bp = useBPForm()
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving]   = useState(false)
  const [distributors, setDistributors] = useState<Opt[]>([])

  useEffect(() => {
    fetch('/api/masters/distributors').then(r => r.json())
      .then((d: { id: string; name: string }[]) => setDistributors(d.map(x => ({ value: x.id, label: x.name }))))
  }, [])

  function openAdd()  { bp.reset();    setEditing(null); setOpen(true) }
  function openEdit(row: Record<string, unknown>) { bp.reset(row); setEditing(row); setOpen(true) }

  async function handleSave() {
    if (!bp.form.name.trim() || !bp.form.taluka_id) return
    if (!bp.validate()) return
    setSaving(true)
    const body = { ...bp.buildBody(), distributor_id: bp.form.distributor_id || null }
    const ok = editing ? await crud.update(editing.id as string, body) : await crud.create(body)
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  // ── Nested New-Distributor modal ──────────────────────────────────────────────
  const newDist = useBPForm()
  const [newDistOpen, setNewDistOpen]   = useState(false)
  const [newDistSaving, setNewDistSaving] = useState(false)

  function openNewDist() { newDist.reset(); setNewDistOpen(true) }

  async function handleNewDistSave() {
    if (!newDist.form.name.trim()) return
    if (!newDist.validate()) return
    setNewDistSaving(true)
    const res = await fetch('/api/masters/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDist.buildBody()),
    })
    setNewDistSaving(false)
    if (res.ok) {
      const created = await res.json()
      setDistributors(prev => [...prev, { value: created.id, label: created.name }].sort((a, b) => a.label.localeCompare(b.label)))
      bp.setF('distributor_id')(created.id)
      setNewDistOpen(false)
    }
  }

  return (
    <>
      <CrudPage
        title="Dealers" backHref="/masters" columns={COLS}
        rows={displayRows} allRowsCount={displayCount}
        isLoading={crud.isLoading} search={crud.search}
        onSearchChange={v => { crud.setSearch(v); setFilterPage(1) }}
        page={displayPage} totalPages={displayTotalPages} onPage={displayOnPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined}
        filterBar={
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowUnassigned(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!showUnassigned ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
              All <span className="ml-1 opacity-70">({crud.allRows.length})</span>
            </button>
            <button onClick={() => { setShowUnassigned(true); setFilterPage(1) }} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showUnassigned ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              Unassigned
              {unassignedRows.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${showUnassigned ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>{unassignedRows.length}</span>
              )}
            </button>
          </div>
        }
      />

      <Modal title={editing ? 'Edit Dealer' : 'Add Dealer'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        <BusinessPartnerFormFields
          hook={bp}
          namePlaceholder="Dealer account name"
          requirePlace
          midSlot={
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Distributor</label>
                <button type="button" onClick={openNewDist} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  New Distributor
                </button>
              </div>
              <SearchableSelect value={bp.form.distributor_id} onChange={bp.setF('distributor_id')} options={distributors} placeholder="Select distributor…" />
            </div>
          }
        />

        <Modal title="New Distributor" isOpen={newDistOpen} onClose={() => setNewDistOpen(false)} onSave={handleNewDistSave} isSaving={newDistSaving} saveLabel="Create & Select" size="lg">
          <BusinessPartnerFormFields hook={newDist} namePlaceholder="Distributor account name" />
        </Modal>
      </Modal>
    </>
  )
}
