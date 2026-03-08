'use client'

import { useState, useEffect } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'

const COLS: Column[] = [
  { key: 'name', label: 'Sub-Category Name' },
  { key: 'cat', label: 'Category', render: r => (r.product_categories as { name: string } | null)?.name ?? '' },
]

export default function ProductSubcategoriesPage() {
  const crud = useCrud('/api/masters/product-subcategories')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator'
  const canEdit = isAdmin || (me?.permissions?.products?.edit ?? false)
  const canDelete = isAdmin || (me?.permissions?.products?.delete ?? false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [name, setName] = useState(''); const [catId, setCatId] = useState('')
  const [cats, setCats] = useState<{ value: string; label: string }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/masters/product-categories').then(r => r.json()).then((d: { id: string; name: string }[]) =>
      setCats(d.map(x => ({ value: x.id, label: x.name }))))
  }, [])

  function openAdd() { setEditing(null); setName(''); setCatId(''); setOpen(true) }
  function openEdit(row: Record<string, unknown>) { setEditing(row); setName(String(row.name)); setCatId(String(row.category_id)); setOpen(true) }

  async function handleSave() {
    if (!name.trim() || !catId) return
    setSaving(true)
    const ok = editing
      ? await crud.update(editing.id as string, { name: name.trim(), category_id: catId })
      : await crud.create({ name: name.trim(), category_id: catId })
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  return (
    <>
      <CrudPage title="Product Sub-Categories" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />
      <Modal title={editing ? 'Edit Sub-Category' : 'Add Sub-Category'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
          <SearchableSelect value={catId} onChange={setCatId} options={cats} placeholder="Select category…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Category Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter sub-category name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </Modal>
    </>
  )
}
