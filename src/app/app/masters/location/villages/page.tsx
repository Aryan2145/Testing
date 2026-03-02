'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EntityTable, { Column } from '@/components/masters/EntityTable'
import EntityModal from '@/components/masters/EntityModal'
import VillageForm from '@/components/masters/location/VillageForm'

type TalukaOption = { id: number; name: string }
type VillageRow = { id: number; name: string; taluka_id: number; is_active: boolean; talukas?: { name: string } }

const COLUMNS: Column[] = [
  { key: 'id', label: '#' },
  { key: 'name', label: 'Village Name' },
  { key: 'taluka_name', label: 'Taluka', render: row => (row.talukas as { name: string } | undefined)?.name ?? '' },
]

export default function VillagesPage() {
  const [rows, setRows] = useState<VillageRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VillageRow | null>(null)
  const [formName, setFormName] = useState('')
  const [formTalukaId, setFormTalukaId] = useState('')
  const [talukas, setTalukas] = useState<TalukaOption[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string) => {
    setIsLoading(true)
    const res = await fetch(`/api/masters/villages?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setIsLoading(false)
  }, [])

  async function fetchTalukas() {
    const res = await fetch('/api/masters/talukas')
    const data = await res.json()
    setTalukas(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchRows(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, fetchRows])

  function openAdd() {
    setEditing(null)
    setFormName('')
    setFormTalukaId('')
    fetchTalukas()
    setModalOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row as VillageRow)
    setFormName(String(row.name ?? ''))
    setFormTalukaId(String(row.taluka_id ?? ''))
    fetchTalukas()
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formTalukaId) return
    setIsSaving(true)
    try {
      if (editing) {
        await fetch(`/api/masters/villages/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), taluka_id: Number(formTalukaId) }),
        })
      } else {
        await fetch('/api/masters/villages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), taluka_id: Number(formTalukaId) }),
        })
      }
      setModalOpen(false)
      fetchRows(search)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggle(row: Record<string, unknown>, value: boolean) {
    await fetch(`/api/masters/villages/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: value }),
    })
    fetchRows(search)
  }

  return (
    <>
      <EntityTable
        title="Villages"
        columns={COLUMNS}
        rows={rows as unknown as Record<string, unknown>[]}
        onEdit={openEdit}
        onToggle={handleToggle}
        searchValue={search}
        onSearchChange={setSearch}
        onAddClick={openAdd}
        isLoading={isLoading}
      />
      <EntityModal
        title={editing ? 'Edit Village' : 'Add Village'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <VillageForm
          name={formName}
          talukaId={formTalukaId}
          talukas={talukas}
          onNameChange={setFormName}
          onTalukaChange={setFormTalukaId}
        />
      </EntityModal>
    </>
  )
}
