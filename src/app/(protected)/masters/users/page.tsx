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
  const [showPassword, setShowPassword] = useState(false)
  const [levels, setLevels] = useState<Level[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [allDesigs, setAllDesigs] = useState<Desig[]>([])
  const [allUsers, setAllUsers] = useState<UserRow[]>([])
  const [license, setLicense] = useState<{ used: number; limit: number | null } | null>(null)
  const [limitError, setLimitError] = useState(false)

  useEffect(() => {
    fetch('/api/masters/levels').then(r => r.json()).then(setLevels)
    fetch('/api/masters/departments').then(r => r.json()).then(setDepts)
    fetch('/api/masters/designations').then(r => r.json()).then(setAllDesigs)
    fetch('/api/masters/users').then(r => r.json()).then(setAllUsers)
    fetch('/api/masters/users/license').then(r => r.json()).then(setLicense)
  }, [])

  const atLimit = license !== null && license.limit !== null && license.used >= license.limit

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

  function openAdd() {
    if (atLimit) { setLimitError(true); return }
    setEditing(null); setForm(INIT); setFormError(''); setShowPassword(false); setOpen(true)
  }
  function openEdit(row: Record<string, unknown>) {
    setEditing(row)
    setFormError('')
    setShowPassword(false)
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
    fetch('/api/masters/users/license').then(r => r.json()).then(setLicense)
  }

  const setF = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const licenseBadge = license?.limit != null ? (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
      atLimit ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'
    }`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
      {license.used} / {license.limit} Users
    </span>
  ) : null

  return (
    <>
      <CrudPage title="Users" headerExtra={licenseBadge} backHref="/masters" columns={COLS} rows={crud.rows} allRowsCount={crud.allRows.length}
        isLoading={crud.isLoading} search={crud.search} onSearchChange={crud.setSearch}
        page={crud.page} totalPages={crud.totalPages} onPage={crud.setPage}
        onAdd={canEdit ? openAdd : undefined}
        onEdit={canEdit ? openEdit : undefined}
        showActive={false}
        onDelete={canDelete ? r => crud.remove(r.id as string) : undefined} />

      {/* License limit error popup */}
      {limitError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">User Limit Reached</h3>
                <p className="text-sm text-gray-600">
                  User limit reached ({license?.used}/{license?.limit}). To add more users, please contact{' '}
                  <span className="font-medium text-gray-900">My Prosys Support team</span> to upgrade your plan.
                </p>
              </div>
            </div>
            <button
              onClick={() => setLimitError(false)}
              className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
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
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setF('password')(e.target.value)} placeholder={editing ? 'Enter new password to change' : 'Set login password'} className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition" tabIndex={-1}>
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
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
