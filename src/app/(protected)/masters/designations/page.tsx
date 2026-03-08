'use client'

import { useState, useEffect } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'

const COLS: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'dept', label: 'Department', render: r => (r.departments as { name: string } | null)?.name ?? '' },
]

export default function DesignationsPage() {
  const crud = useCrud('/api/masters/designations')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator'
  const canEdit = isAdmin || (me?.permissions?.organization?.edit ?? false)
  const canDelete = isAdmin || (me?.permissions?.organization?.delete ?? false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [name, setName] = useState(''); const [deptId, setDeptId] = useState('')
  const [depts, setDepts] = useState<{ value: string; label: string }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/masters/departments').then(r => r.json()).then((d: { id: string; name: string }[]) =>
      setDepts(d.map(x => ({ value: x.id, label: x.name }))))
  }, [])

  function openAdd() { setEditing(null); setName(''); setDeptId(''); setOpen(true) }
  function openEdit(row: Record<string, unknown>) { setEditing(row); setName(String(row.name)); setDeptId(String(row.department_id)); setOpen(true) }

  async function handleSave() {
    if (!name.trim() || !deptId) return
    setSaving(true)
    const ok = editing
      ? await crud.update(editing.id as string, { name: name.trim(), department_id: deptId })
      : await crud.create({ name: name.trim(), department_id: deptId })
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage title="Designations" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />
      <Modal title={editing ? 'Edit Designation' : 'Add Designation'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-red-500">*</span></label>
          <SearchableSelect value={deptId} onChange={setDeptId} options={depts} placeholder="Select department…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Designation Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter designation name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </Modal>
    </>
  )
}
