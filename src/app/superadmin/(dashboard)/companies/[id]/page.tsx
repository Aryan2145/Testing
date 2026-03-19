'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Company = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  gstin: string | null
  license_count: number
  payment_status: 'Active' | 'Overdue' | 'Suspended'
  payment_due_date: string | null
  is_active: boolean
  total_users: number
  active_users: number
  adminUser: { id: string; name: string; email: string | null; contact: string } | null
}

const STATUS_STYLES = {
  Active: 'bg-green-50 text-green-700',
  Overdue: 'bg-yellow-50 text-yellow-700',
  Suspended: 'bg-red-50 text-red-700',
}

export default function CompanyDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', gstin: '',
    license_count: '', payment_status: 'Active', payment_due_date: '',
  })
  const [adminForm, setAdminForm] = useState({
    id: '', name: '', email: '', contact: '', newPassword: '',
  })
  const [confirmDisable, setConfirmDisable] = useState(false)

  async function load() {
    const res = await fetch(`/api/superadmin/companies/${id}`)
    if (!res.ok) { router.push('/superadmin/companies'); return }
    const data: Company = await res.json()
    setCompany(data)
    setForm({
      name: data.name,
      email: data.email ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      gstin: data.gstin ?? '',
      license_count: String(data.license_count),
      payment_status: data.payment_status,
      payment_due_date: data.payment_due_date ?? '',
    })
    if (data.adminUser) {
      setAdminForm({
        id: data.adminUser.id,
        name: data.adminUser.name,
        email: data.adminUser.email ?? '',
        contact: data.adminUser.contact,
        newPassword: '',
      })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const F = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const AF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAdminForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Company name is required'); return }
    setError(''); setSuccess(''); setSaving(true)
    const res = await fetch(`/api/superadmin/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        gstin: form.gstin.trim().toUpperCase() || null,
        license_count: Number(form.license_count),
        payment_status: form.payment_status,
        payment_due_date: form.payment_due_date || null,
        ...(adminForm.id ? {
          adminUser: {
            id: adminForm.id,
            name: adminForm.name,
            email: adminForm.email,
            contact: adminForm.contact,
            password: adminForm.newPassword || undefined,
          }
        } : {}),
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Save failed'); return }
    setCompany(prev => prev ? { ...prev, ...data } : null)
    setAdminForm(f => ({ ...f, newPassword: '' }))
    setSuccess('Changes saved successfully')
    setTimeout(() => setSuccess(''), 3000)
  }

  async function toggleActive() {
    if (!company) return
    if (!company.is_active) {
      // Re-enable
      const res = await fetch(`/api/superadmin/companies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (res.ok) setCompany(c => c ? { ...c, is_active: true } : c)
    } else {
      setConfirmDisable(true)
    }
  }

  async function confirmDisableAction() {
    setConfirmDisable(false)
    const res = await fetch(`/api/superadmin/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    if (res.ok) setCompany(c => c ? { ...c, is_active: false } : c)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    )
  }

  if (!company) return null

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/superadmin/companies')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{company.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[company.payment_status]}`}>
              {company.payment_status}
            </span>
            {!company.is_active && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                Disabled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status warning */}
      {(!company.is_active || company.payment_status === 'Suspended') && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {!company.is_active
            ? 'This company is disabled. All users are blocked from logging in.'
            : "This company's payment is suspended. All users are blocked from logging in."}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{company.total_users}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Users</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className={`text-2xl font-bold ${company.total_users >= company.license_count ? 'text-red-600' : 'text-gray-900'}`}>
            {company.total_users} / {company.license_count}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">License Usage</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{company.active_users}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active Users</div>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Company Settings</h2>

        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">{success}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={F('name')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={F('email')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={F('phone')} maxLength={10} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea value={form.address} onChange={F('address')} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
          <input type="text" value={form.gstin} onChange={F('gstin')} maxLength={15} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">License Count</label>
            <input type="number" value={form.license_count} onChange={F('license_count')} min={1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
            <select value={form.payment_status} onChange={F('payment_status')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
              <option value="Active">Active</option>
              <option value="Overdue">Overdue</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Due Date</label>
            <input type="date" value={form.payment_due_date} onChange={F('payment_due_date')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>

        {/* Admin User section */}
        {adminForm.id && (
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div>
              <h2 className="font-medium text-gray-900">Admin User</h2>
              <p className="text-xs text-gray-500 mt-0.5">Administrator account for this company</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={adminForm.name} onChange={AF('name')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (Login)</label>
                <input type="tel" value={adminForm.contact} onChange={AF('contact')} maxLength={10} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={adminForm.email} onChange={AF('email')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
              <input type="text" value={adminForm.newPassword} onChange={AF('newPassword')} placeholder="Enter new password to change" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={toggleActive}
            className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${company.is_active ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}
          >
            {company.is_active ? 'Disable All Logins' : 'Re-enable Logins'}
          </button>
        </div>
      </form>

      {/* Confirm disable dialog */}
      {confirmDisable && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 mb-2">Disable All Logins?</h3>
            <p className="text-sm text-gray-500 mb-5">All users of <strong>{company.name}</strong> will be blocked from logging in immediately.</p>
            <div className="flex gap-3">
              <button onClick={confirmDisableAction} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                Disable
              </button>
              <button onClick={() => setConfirmDisable(false)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
