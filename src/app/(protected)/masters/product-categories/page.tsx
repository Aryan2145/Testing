'use client'

import { useState } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'

const COLS: Column[] = [{ key: 'name', label: 'Category Name' }]

export default function ProductCategoriesPage() {
  const crud = useCrud('/api/masters/product-categories')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator'
  const canEdit = isAdmin || (me?.permissions?.products?.edit ?? false)
  const canDelete = isAdmin || (me?.permissions?.products?.delete ?? false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false)

  function openAdd() { setEditing(null); setName(''); setOpen(true) }
  function openEdit(row: Record<string, unknown>) { setEditing(row); setName(String(row.name)); setOpen(true) }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const ok = editing ? await crud.update(editing.id as string, { name: name.trim() }) : await crud.create({ name: name.trim() })
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage title="Product Categories" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />
      <Modal title={editing ? 'Edit Category' : 'Add Category'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Enter category name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </Modal>
    </>
  )
}
