'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EntityTable, { Column } from '@/components/masters/EntityTable'
import EntityModal from '@/components/masters/EntityModal'
import StateForm from '@/components/masters/location/StateForm'

type StateRow = { id: number; name: string; is_active: boolean }

const COLUMNS: Column[] = [
  { key: 'id', label: '#' },
  { key: 'name', label: 'State Name' },
]

export default function StatesPage() {
  const [rows, setRows] = useState<StateRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StateRow | null>(null)
  const [formName, setFormName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string) => {
    setIsLoading(true)
    const res = await fetch(`/api/masters/states?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchRows(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, fetchRows])

  function openAdd() {
    setEditing(null)
    setFormName('')
    setModalOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row as StateRow)
    setFormName(String(row.name ?? ''))
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setIsSaving(true)
    try {
      if (editing) {
        await fetch(`/api/masters/states/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim() }),
        })
      } else {
        await fetch('/api/masters/states', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim() }),
        })
      }
      setModalOpen(false)
      fetchRows(search)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggle(row: Record<string, unknown>, value: boolean) {
    await fetch(`/api/masters/states/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: value }),
    })
    fetchRows(search)
  }

  return (
    <>
      <EntityTable
        title="States"
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
        title={editing ? 'Edit State' : 'Add State'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <StateForm name={formName} onChange={setFormName} />
      </EntityModal>
    </>
  )
}
