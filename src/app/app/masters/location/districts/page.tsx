'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EntityTable, { Column } from '@/components/masters/EntityTable'
import EntityModal from '@/components/masters/EntityModal'
import DistrictForm from '@/components/masters/location/DistrictForm'

type StateOption = { id: number; name: string }
type DistrictRow = { id: number; name: string; state_id: number; is_active: boolean; states?: { name: string } }

const COLUMNS: Column[] = [
  { key: 'id', label: '#' },
  { key: 'name', label: 'District Name' },
  { key: 'state_name', label: 'State', render: row => (row.states as { name: string } | undefined)?.name ?? '' },
]

export default function DistrictsPage() {
  const [rows, setRows] = useState<DistrictRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DistrictRow | null>(null)
  const [formName, setFormName] = useState('')
  const [formStateId, setFormStateId] = useState('')
  const [states, setStates] = useState<StateOption[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string) => {
    setIsLoading(true)
    const res = await fetch(`/api/masters/districts?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setIsLoading(false)
  }, [])

  async function fetchStates() {
    const res = await fetch('/api/masters/states')
    const data = await res.json()
    setStates(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchRows(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, fetchRows])

  function openAdd() {
    setEditing(null)
    setFormName('')
    setFormStateId('')
    fetchStates()
    setModalOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row as DistrictRow)
    setFormName(String(row.name ?? ''))
    setFormStateId(String(row.state_id ?? ''))
    fetchStates()
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formStateId) return
    setIsSaving(true)
    try {
      if (editing) {
        await fetch(`/api/masters/districts/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), state_id: Number(formStateId) }),
        })
      } else {
        await fetch('/api/masters/districts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), state_id: Number(formStateId) }),
        })
      }
      setModalOpen(false)
      fetchRows(search)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggle(row: Record<string, unknown>, value: boolean) {
    await fetch(`/api/masters/districts/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: value }),
    })
    fetchRows(search)
  }

  return (
    <>
      <EntityTable
        title="Districts"
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
        title={editing ? 'Edit District' : 'Add District'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <DistrictForm
          name={formName}
          stateId={formStateId}
          states={states}
          onNameChange={setFormName}
          onStateChange={setFormStateId}
        />
      </EntityModal>
    </>
  )
}
