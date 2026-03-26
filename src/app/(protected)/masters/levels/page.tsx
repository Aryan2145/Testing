'use client'

import { useState } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'

const COLS: Column[] = [
  { key: 'level_no', label: 'Level No' },
  { key: 'name', label: 'Name' },
]

export default function LevelsPage() {
  const crud = useCrud('/api/masters/levels')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator'
  const canEdit = isAdmin || (me?.permissions?.organization?.edit ?? false)
  const canDelete = isAdmin || (me?.permissions?.organization?.delete ?? false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [name, setName] = useState('')
  const [levelNo, setLevelNo] = useState('')
  const [saving, setSaving] = useState(false)

  function openAdd() {
    const nextNo = crud.allRows.length > 0
      ? Math.max(...crud.allRows.map(r => Number(r.level_no))) + 1
      : 1
    setEditing(null)
    setLevelNo(String(nextNo))
    setName(`L${nextNo}`)
    setOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row)
    setName(String(row.name))
    setLevelNo(String(row.level_no))
    setOpen(true)
  }

  async function handleSave() {
    if (!name.trim() || !levelNo) return
    setSaving(true)
    const ok = editing
      ? await crud.update(editing.id as string, { name: name.trim() })
      : await crud.create({ name: name.trim(), level_no: Number(levelNo) })
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage title="Levels" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />
      <Modal title={editing ? 'Edit Level' : 'Add Level'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Level No</label>
          <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 select-none">
            {levelNo}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Level Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Director"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </Modal>
    </>
  )
}
