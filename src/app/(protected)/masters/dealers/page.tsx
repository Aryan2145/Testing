'use client'

import { useState, useEffect, useMemo } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useCrud } from '@/hooks/useCrud'

const COLS: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'state', label: 'State', render: r => (r.states as { name: string } | null)?.name ?? '' },
  { key: 'district', label: 'District', render: r => (r.districts as { name: string } | null)?.name ?? '' },
  { key: 'taluka', label: 'Taluka', render: r => (r.talukas as { name: string } | null)?.name ?? '' },
]

type Opt = { value: string; label: string }
type DistrictItem = { id: string; name: string; state_id: string }
type TalukaItem = { id: string; name: string; district_id: string }
type VillageItem = { id: string; name: string; taluka_id: string }
type PlaceResolved = { state_id: string; district_id: string; taluka_id: string; village_id: string | null }

export default function DealersPage() {
  const crud = useCrud('/api/masters/dealers')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState({ name: '', place: '', state_id: '', district_id: '', taluka_id: '', village_id: '', distributor_id: '', phone: '', address: '', description: '', latitude: '', longitude: '' })
  const [phoneError, setPhoneError] = useState('')
  const [saving, setSaving] = useState(false)
  const [districts, setDistricts] = useState<DistrictItem[]>([])
  const [talukas, setTalukas] = useState<TalukaItem[]>([])
  const [villages, setVillages] = useState<VillageItem[]>([])
  const [distributors, setDistributors] = useState<Opt[]>([])

  useEffect(() => {
    fetch('/api/masters/districts').then(r => r.json()).then(setDistricts)
    fetch('/api/masters/talukas').then(r => r.json()).then(setTalukas)
    fetch('/api/masters/villages').then(r => r.json()).then(setVillages)
    fetch('/api/masters/distributors').then(r => r.json()).then((d: DistrictItem[]) => setDistributors(d.map(x => ({ value: x.id, label: x.name }))))
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
    setForm({ name: '', place: '', state_id: '', district_id: '', taluka_id: '', village_id: '', distributor_id: '', phone: '', address: '', description: '', latitude: '', longitude: '' })
    setPhoneError('')
    setOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row)
    const place = row.village_id ? `v:${row.village_id}` : row.taluka_id ? `t:${row.taluka_id}` : ''
    setForm({
      name: String(row.name),
      place,
      state_id: String(row.state_id ?? ''),
      district_id: String(row.district_id ?? ''),
      taluka_id: String(row.taluka_id ?? ''),
      village_id: String(row.village_id ?? ''),
      distributor_id: String(row.distributor_id ?? ''),
      phone: String(row.phone ?? ''),
      address: String(row.address ?? ''),
      description: String(row.description ?? ''),
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
    if (!form.name.trim() || !form.taluka_id) return
    if (form.phone && !/^\d{10}$/.test(form.phone.trim())) {
      setPhoneError('Phone must be exactly 10 digits')
      return
    }
    setPhoneError('')
    setSaving(true)
    const body = {
      name: form.name.trim(),
      state_id: form.state_id, district_id: form.district_id, taluka_id: form.taluka_id,
      village_id: form.village_id || null, distributor_id: form.distributor_id || null,
      phone: form.phone.trim() || null, address: form.address || null, description: form.description || null,
      latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null,
    }
    const ok = editing ? await crud.update(editing.id as string, body) : await crud.create(body)
    setSaving(false)
    if (ok !== false && ok !== null) setOpen(false)
  }

  const setF = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }))
  const F = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <CrudPage title="Dealers" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={openAdd} onEdit={openEdit} onToggleActive={(r, v) => crud.update(r.id as string, { is_active: v })}
        onDelete={r => crud.remove(r.id as string)} />
      <Modal title={editing ? 'Edit Dealer' : 'Add Dealer'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dealer Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={F('name')} placeholder="Dealer name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Place <span className="text-red-500">*</span></label>
          <SearchableSelect value={form.place} onChange={handlePlaceChange} options={placeOptions} placeholder="Search by district, taluka or village…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Distributor</label>
          <SearchableSelect value={form.distributor_id} onChange={setF('distributor_id')} options={distributors} placeholder="Optional…" />
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
