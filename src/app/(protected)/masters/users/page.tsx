'use client'

import { useState, useEffect } from 'react'
import CrudPage, { Column } from '@/components/ui/CrudPage'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import StatusBadge from '@/components/ui/StatusBadge'
import { useCrud } from '@/hooks/useCrud'
import { useMe } from '@/hooks/useMe'

type Level = { id: string; name: string; level_no: number }
type Dept = { id: string; name: string }
type Desig = { id: string; name: string; department_id: string }
type UserRow = { id: string; name: string; level_id: string; levels?: Level }

const COLS: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'contact', label: 'Contact' },
  { key: 'email', label: 'Email' },
  { key: 'level', label: 'Level', render: r => (r.levels as Level | null)?.name ?? '' },
  { key: 'profile', label: 'Profile' },
  { key: 'manager', label: 'Manager', render: r => (r.manager as { name: string } | null)?.name ?? '—' },
  { key: 'status', label: 'Status', render: r => <StatusBadge status={String(r.status)} /> },
]

const INIT = { name: '', email: '', contact: '', password: '', department_id: '', designation_id: '', level_id: '', profile: 'Standard', manager_user_id: '', status: 'Active' }

export default function UsersPage() {
  const crud = useCrud('/api/masters/users')
  const me = useMe()
  const isAdmin = me?.role === 'Administrator'
  const canEdit = isAdmin || (me?.permissions?.users?.edit ?? false)
  const canDelete = isAdmin || (me?.permissions?.users?.delete ?? false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [levels, setLevels] = useState<Level[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [allDesigs, setAllDesigs] = useState<Desig[]>([])
  const [allUsers, setAllUsers] = useState<UserRow[]>([])

  useEffect(() => {
    fetch('/api/masters/levels').then(r => r.json()).then(setLevels)
    fetch('/api/masters/departments').then(r => r.json()).then(setDepts)
    fetch('/api/masters/designations').then(r => r.json()).then(setAllDesigs)
    fetch('/api/masters/users').then(r => r.json()).then(setAllUsers)
  }, [])

  // Manager candidates based on selected level
  const selectedLevel = levels.find(l => l.id === form.level_id)
  const managerCandidates = allUsers.filter(u => {
    if (editing && u.id === (editing.id as string)) return false
    if (!selectedLevel) return true
    const uLevel = u.levels?.level_no ?? 99
    if (selectedLevel.level_no === 2) return uLevel === 1
    if (selectedLevel.level_no === 3) return uLevel <= 2
    return true
  })

  const filteredDesigs = allDesigs.filter(d => !form.department_id || d.department_id === form.department_id)

  function openAdd() { setEditing(null); setForm(INIT); setFormError(''); setOpen(true) }
  function openEdit(row: Record<string, unknown>) {
    setEditing(row)
    setFormError('')
    setForm({ name: String(row.name), email: String(row.email), contact: String(row.contact), password: '', department_id: String(row.department_id ?? ''), designation_id: String(row.designation_id ?? ''), level_id: String(row.level_id), profile: String(row.profile), manager_user_id: String(row.manager_user_id ?? ''), status: String(row.status) })
    setOpen(true)
  }

  async function handleSave() {
    setFormError('')
    if (!form.name.trim()) { setFormError('Full name is required'); return }
    if (!form.email.trim()) { setFormError('Email is required'); return }
    if (!form.contact.trim()) { setFormError('Contact number is required'); return }
    if (!form.level_id) { setFormError('Level is required'); return }
    if (!form.profile) { setFormError('Profile is required'); return }
    if (!editing && !form.password.trim()) { setFormError('Password is required for new users'); return }
    setSaving(true)
    const body: Record<string, unknown> = { name: form.name.trim(), email: form.email.trim(), contact: form.contact.trim(), department_id: form.department_id || null, designation_id: form.designation_id || null, level_id: form.level_id, profile: form.profile, manager_user_id: form.manager_user_id || null, status: form.status }
    if (!editing || form.password.trim()) body.password = form.password.trim()
    const res = await fetch(editing ? `/api/masters/users/${editing.id as string}` : '/api/masters/users', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setFormError(data.error ?? 'Save failed. Please try again.')
      return
    }
    setOpen(false)
    crud.refetch()
    fetch('/api/masters/users').then(r => r.json()).then(setAllUsers)
  }

  const setF = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <>
      <CrudPage title="Users" backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        showActive={false}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />
      <Modal title={editing ? 'Edit User' : 'Add User'} isOpen={open} onClose={() => setOpen(false)} onSave={handleSave} isSaving={saving} size="lg">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 -mt-2">
            {formError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setF('name')(e.target.value)} placeholder="Full name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={e => setF('email')(e.target.value)} placeholder="email@example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact <span className="text-red-500">*</span></label>
            <input type="tel" value={form.contact} onChange={e => setF('contact')(e.target.value)} placeholder="10-digit mobile" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {editing ? <span className="text-gray-400 font-normal">(leave blank to keep current)</span> : <span className="text-red-500">*</span>}
            </label>
            <input type="password" value={form.password} onChange={e => setF('password')(e.target.value)} placeholder={editing ? 'Enter new password to change' : 'Set login password'} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <SearchableSelect value={form.department_id} onChange={v => setForm(f => ({ ...f, department_id: v, designation_id: '' }))} options={depts.map(d => ({ value: d.id, label: d.name }))} placeholder="Select dept…" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
            <SearchableSelect value={form.designation_id} onChange={setF('designation_id')} options={filteredDesigs.map(d => ({ value: d.id, label: d.name }))} placeholder="Select desig…" disabled={!form.department_id} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level <span className="text-red-500">*</span></label>
            <SearchableSelect value={form.level_id} onChange={v => setForm(f => ({ ...f, level_id: v, manager_user_id: '' }))} options={levels.map(l => ({ value: l.id, label: l.name }))} placeholder="Select level…" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile <span className="text-red-500">*</span></label>
            <select value={form.profile} onChange={e => setF('profile')(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="Standard">Standard</option>
              <option value="Administrator">Administrator</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Manager {selectedLevel?.level_no === 2 ? '(must be L1)' : selectedLevel?.level_no === 3 ? '(must be L1 or L2)' : ''}
            </label>
            <SearchableSelect value={form.manager_user_id} onChange={setF('manager_user_id')} options={managerCandidates.map(u => ({ value: u.id, label: `${u.name} (${u.levels?.name ?? ''})` }))} placeholder="Select manager…" />
          </div>
          {editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setF('status')(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
