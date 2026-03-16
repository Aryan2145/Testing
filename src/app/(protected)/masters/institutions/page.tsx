'use client'

import { useState, useEffect, useMemo } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'

const COLS: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone', render: r => String(r.phone ?? '—') },
  { key: 'place', label: 'Place', render: r => {
    const dist = (r.districts as { name: string } | null)?.name
    const talu = (r.talukas as { name: string } | null)?.name
    const vill = (r.villages as { name: string } | null)?.name
    if (!dist) return <span className="text-gray-400">—</span>
    return <span>{[`District: ${dist}`, talu && `Taluka: ${talu}`, vill && `Village: ${vill}`].filter(Boolean).join(', ')}</span>
  }},
]

type Opt = { value: string; label: string }
type DistrictItem = { id: string; name: string; state_id: string }
type TalukaItem = { id: string; name: string; district_id: string }
type VillageItem = { id: string; name: string; taluka_id: string }
type PlaceResolved = { state_id: string; district_id: string; taluka_id: string; village_id: string | null }

export default function InstitutionsPage() {
  const crud = useCrud('/api/masters/institutions')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator'
  const canEdit = isAdmin || (me?.permissions?.business?.edit ?? false)
  const canDelete = isAdmin || (me?.permissions?.business?.delete ?? false)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', address: '', description: '', place: '', state_id: '', district_id: '', taluka_id: '', village_id: '', latitude: '', longitude: '' })
  const [phoneError, setPhoneError] = useState('')
  const [saving, setSaving] = useState(false)

  const [districts, setDistricts] = useState<DistrictItem[]>([])
  const [talukas, setTalukas] = useState<TalukaItem[]>([])
  const [villages, setVillages] = useState<VillageItem[]>([])

  useEffect(() => {
    fetch('/api/masters/districts').then(r => r.json()).then(setDistricts)
    fetch('/api/masters/talukas').then(r => r.json()).then(setTalukas)
    fetch('/api/masters/villages').then(r => r.json()).then(setVillages)
  }, [])

  const { placeOptions, placeMap } = useMemo(() => {
    const distMap = new Map(districts.map(d => [d.id, d]))
    const taluMap = new Map(talukas.map(t => [t.id, t]))
    const placeMap = new Map<string, PlaceResolved>()
    const opts: Opt[] = []

    for (const t of talukas) {
      const dist = distMap.get(t.district_id)
      if (!dist) continue
      const val = `t:${t.id}`
      opts.push({ value: val, label: `District: ${dist.name}, Taluka: ${t.name}` })
      placeMap.set(val, { state_id: dist.state_id, district_id: t.district_id, taluka_id: t.id, village_id: null })
    }

    for (const v of villages) {
      const talu = taluMap.get(v.taluka_id)
      const dist = talu ? distMap.get(talu.district_id) : undefined
      if (!talu || !dist) continue
      const val = `v:${v.id}`
      opts.push({ value: val, label: `District: ${dist.name}, Taluka: ${talu.name}, Village: ${v.name}` })
      placeMap.set(val, { state_id: dist.state_id, district_id: talu.district_id, taluka_id: v.taluka_id, village_id: v.id })
    }

    return { placeOptions: opts, placeMap }
  }, [districts, talukas, villages])

  function openAdd() {
    setEditing(null)
    setForm({ name: '', phone: '', address: '', description: '', place: '', state_id: '', district_id: '', taluka_id: '', village_id: '', latitude: '', longitude: '' })
    setPhoneError('')
    setOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row)
    const place = row.village_id ? `v:${row.village_id}` : row.taluka_id ? `t:${row.taluka_id}` : ''
    setForm({
      name: String(row.name),
      phone: String(row.phone ?? ''),
      address: String(row.address ?? ''),
      description: String(row.description ?? ''),
      place,
      state_id: String(row.state_id ?? ''),
      district_id: String(row.district_id ?? ''),
      taluka_id: String(row.taluka_id ?? ''),
      village_id: String(row.village_id ?? ''),
      latitude: String(row.latitude ?? ''),
      longitude: String(row.longitude ?? ''),
    })
    setPhoneError('')
    setOpen(true)
  }

  function handlePlaceChange(val: string) {
    const resolved = placeMap.get(val)
    if (resolved) {
      setForm(f => ({ ...f, place: val, state_id: resolved.state_id, district_id: resolved.district_id, taluka_id: resolved.taluka_id, village_id: resolved.village_id ?? '' }))
    } else {
      setForm(f => ({ ...f, place: '', state_id: '', district_id: '', taluka_id: '', village_id: '' }))
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (form.phone && !/^\d{10}$/.test(form.phone.trim())) {
      setPhoneError('Phone must be exactly 10 digits')
      return
    }
    setPhoneError('')
    setSaving(true)
    const body = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address || null,
      description: form.description || null,
      state_id: form.state_id || null,
      district_id: form.district_id || null,
      taluka_id: form.taluka_id || null,
      village_id: form.village_id || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
    }
    const ok = editing ? await crud.update(editing.id as string, body) : await crud.create(body)
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  const F = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <CrudPage
        title="Institutions / Consumers" backHref="/masters" columns={COLS}
        rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? (r, v) => crud.update(r.id as string, { is_active: v }) : undefined}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined}
      />
      <Modal title={editing ? 'Edit Institution / Consumer' : 'Add Institution / Consumer'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={F('name')} placeholder="Institution / Consumer name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Place</label>
          <SearchableSelect value={form.place} onChange={handlePlaceChange} options={placeOptions} placeholder="Search by district, taluka or village…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <input type="tel" value={form.phone} onChange={e => { F('phone')(e); setPhoneError('') }} placeholder="10-digit number" maxLength={10} className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${phoneError ? 'border-red-400' : 'border-gray-300'}`} />
          {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea value={form.address} onChange={F('address')} rows={2} placeholder="Address" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={F('description')} rows={2} placeholder="Description" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
            <input type="number" step="0.0000001" value={form.latitude} onChange={F('latitude')} placeholder="-90 to 90" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
            <input type="number" step="0.0000001" value={form.longitude} onChange={F('longitude')} placeholder="-180 to 180" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </Modal>
    </>
  )
}
