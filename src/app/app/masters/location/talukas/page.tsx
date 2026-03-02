'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EntityTable, { Column } from '@/components/masters/EntityTable'
import EntityModal from '@/components/masters/EntityModal'
import TalukaForm from '@/components/masters/location/TalukaForm'

type DistrictOption = { id: number; name: string }
type TalukaRow = { id: number; name: string; district_id: number; is_active: boolean; districts?: { name: string } }

const COLUMNS: Column[] = [
  { key: 'id', label: '#' },
  { key: 'name', label: 'Taluka Name' },
  { key: 'district_name', label: 'District', render: row => (row.districts as { name: string } | undefined)?.name ?? '' },
]

export default function TalukasPage() {
  const [rows, setRows] = useState<TalukaRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TalukaRow | null>(null)
  const [formName, setFormName] = useState('')
  const [formDistrictId, setFormDistrictId] = useState('')
  const [districts, setDistricts] = useState<DistrictOption[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string) => {
    setIsLoading(true)
    const res = await fetch(`/api/masters/talukas?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setIsLoading(false)
  }, [])

  async function fetchDistricts() {
    const res = await fetch('/api/masters/districts')
    const data = await res.json()
    setDistricts(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchRows(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, fetchRows])

  function openAdd() {
    setEditing(null)
    setFormName('')
    setFormDistrictId('')
    fetchDistricts()
    setModalOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row as TalukaRow)
    setFormName(String(row.name ?? ''))
    setFormDistrictId(String(row.district_id ?? ''))
    fetchDistricts()
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formDistrictId) return
    setIsSaving(true)
    try {
      if (editing) {
        await fetch(`/api/masters/talukas/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), district_id: Number(formDistrictId) }),
        })
      } else {
        await fetch('/api/masters/talukas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), district_id: Number(formDistrictId) }),
        })
      }
      setModalOpen(false)
      fetchRows(search)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggle(row: Record<string, unknown>, value: boolean) {
    await fetch(`/api/masters/talukas/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: value }),
    })
    fetchRows(search)
  }

  return (
    <>
      <EntityTable
        title="Talukas"
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
        title={editing ? 'Edit Taluka' : 'Add Taluka'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <TalukaForm
          name={formName}
          districtId={formDistrictId}
          districts={districts}
          onNameChange={setFormName}
          onDistrictChange={setFormDistrictId}
        />
      </EntityModal>
    </>
  )
}
