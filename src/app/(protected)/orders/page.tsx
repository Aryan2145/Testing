'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/contexts/ToastContext'

type OrderRow = {
  id: string
  order_date: string
  order_source: 'meeting' | 'direct'
  entity_type: 'Dealer' | 'Distributor' | null
  entity_id: string | null
  entity_name: string | null
  visit_id: string | null
  user_id: string
  status: 'Draft' | 'Submitted' | 'Confirmed'
  total_amount: number
  users: { name: string } | null
}

type OrderDetail = OrderRow & {
  order_items: {
    id: string
    product_name: string
    qty: number
    rate: number
    amount: number
  }[]
}

type Product = { id: string; name: string; price: number }
type TeamMember = { id: string; name: string }

type OrderItem = {
  product_id: string | null
  product_name: string
  qty: number
  rate: number
}

type DealerResult = { id: string; name: string; districts: { name: string } | null }
type DistributorResult = { id: string; name: string }

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Submitted: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-green-100 text-green-700',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtAmount(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─────────────────────────────────────────────────────────────
// CreateOrderModal
// ─────────────────────────────────────────────────────────────
function CreateOrderModal({
  onClose, onSaved, hasSubordinates,
}: {
  onClose: () => void
  onSaved: () => void
  hasSubordinates: boolean
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  // Basic info
  const [entityType, setEntityType] = useState<'Dealer' | 'Distributor'>('Dealer')
  const [entitySearch, setEntitySearch] = useState('')
  const [entityResults, setEntityResults] = useState<(DealerResult | DistributorResult)[]>([])
  const [entityOpen, setEntityOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; name: string; territory?: string } | null>(null)
  const [salesExecs, setSalesExecs] = useState<TeamMember[]>([])
  const [salesUserId, setSalesUserId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState<'Draft' | 'Submitted' | 'Confirmed'>('Draft')

  // Products
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<OrderItem[]>([{ product_id: null, product_name: '', qty: 1, rate: 0 }])

  useEffect(() => {
    fetch('/api/masters/products').then(r => r.json()).then(d => {
      setProducts(Array.isArray(d) ? d : [])
    }).catch(() => {})

    if (hasSubordinates) {
      fetch('/api/orders/team').then(r => r.json()).then(d => {
        const team: TeamMember[] = Array.isArray(d) ? d : []
        setSalesExecs(team)
        if (team.length > 0) setSalesUserId(team[0].id)
      }).catch(() => {})
    }
  }, [hasSubordinates])

  // Debounced entity search
  useEffect(() => {
    if (!entitySearch.trim() || selectedEntity) { setEntityResults([]); setEntityOpen(false); return }
    const t = setTimeout(() => {
      const url = entityType === 'Dealer'
        ? `/api/masters/dealers?q=${encodeURIComponent(entitySearch)}`
        : `/api/masters/distributors?q=${encodeURIComponent(entitySearch)}`
      fetch(url).then(r => r.json()).then(d => {
        setEntityResults(Array.isArray(d) ? d.slice(0, 8) : [])
        setEntityOpen(true)
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [entitySearch, entityType, selectedEntity])

  function selectEntity(item: DealerResult | DistributorResult) {
    const territory = entityType === 'Dealer' && 'districts' in item && (item as DealerResult).districts
      ? (item as DealerResult).districts!.name
      : undefined
    setSelectedEntity({ id: item.id, name: item.name, territory })
    setEntitySearch(item.name)
    setEntityOpen(false)
    setEntityResults([])
  }

  function addRow() {
    setItems(prev => [...prev, { product_id: null, product_name: '', qty: 1, rate: 0 }])
  }
  function removeRow(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  function updateRow(idx: number, field: keyof OrderItem, value: string | number | null) {
    setItems(prev => prev.map((row, i) => i !== idx ? row : { ...row, [field]: value }))
  }
  function onProductSelect(idx: number, productId: string) {
    const p = products.find(px => px.id === productId)
    if (p) {
      // Duplicate prevention: if same product_id exists in another row, increment that row's qty
      const existingIdx = items.findIndex((row, i) => i !== idx && row.product_id === p.id)
      if (existingIdx !== -1) {
        setItems(prev => prev.map((row, i) => {
          if (i === existingIdx) return { ...row, qty: row.qty + 1 }
          if (i === idx) return { product_id: null, product_name: '', qty: 1, rate: 0 }
          return row
        }))
        return
      }
      setItems(prev => prev.map((row, i) => i !== idx ? row : {
        ...row, product_id: p.id, product_name: p.name, rate: Number(p.price),
      }))
    } else {
      updateRow(idx, 'product_id', null)
    }
  }

  const validItems = items.filter(i => i.product_name.trim() && i.qty > 0)
  const total = validItems.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalQty = validItems.reduce((s, i) => s + i.qty, 0)

  async function handleSave() {
    if (!selectedEntity) { toast('Please select a dealer or distributor', 'error'); return }
    if (validItems.length === 0) { toast('Add at least one product', 'error'); return }
    if (total <= 0) { toast('Total order value must be greater than 0', 'error'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        order_source: 'direct',
        entity_type: entityType,
        entity_id: selectedEntity.id,
        entity_name: selectedEntity.name,
        order_date: orderDate,
        status,
        items: validItems,
      }
      if (hasSubordinates && salesUserId) body.sales_user_id = salesUserId
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast((err as { error?: string }).error ?? 'Failed to create order', 'error')
      } else {
        toast('Order created successfully')
        onSaved()
        onClose()
      }
    } catch {
      toast('Network error', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h3 className="font-semibold text-gray-900">Create Order</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* ── Section 1: Basic Info ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Basic Information</p>
            <div className="space-y-3">
              {/* Entity type toggle */}
              <div className="flex gap-2">
                {(['Dealer', 'Distributor'] as const).map(t => (
                  <button key={t}
                    onClick={() => { setEntityType(t); setSelectedEntity(null); setEntitySearch(''); setEntityResults([]) }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${entityType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Entity search */}
              <div className="relative">
                <label className="block text-xs text-gray-500 mb-1">{entityType} <span className="text-red-500">*</span></label>
                <input type="text" value={entitySearch}
                  onChange={e => { setEntitySearch(e.target.value); setSelectedEntity(null) }}
                  onBlur={() => setTimeout(() => setEntityOpen(false), 150)}
                  placeholder={`Search ${entityType.toLowerCase()}...`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {entityOpen && entityResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {entityResults.map(item => (
                      <button key={item.id} onMouseDown={() => selectEntity(item)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
                        <div className="font-medium text-gray-800">{item.name}</div>
                        {entityType === 'Dealer' && 'districts' in item && (item as DealerResult).districts && (
                          <div className="text-xs text-gray-500">{(item as DealerResult).districts?.name}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Area/Territory — auto-filled from dealer's district */}
              {selectedEntity?.territory && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Area / Territory</label>
                  <input type="text" value={selectedEntity.territory} readOnly
                    className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-not-allowed" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Sales Executive */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sales Executive <span className="text-red-500">*</span></label>
                  {hasSubordinates ? (
                    <select value={salesUserId} onChange={e => setSalesUserId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {salesExecs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  ) : (
                    <input type="text" value="You" readOnly
                      className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-not-allowed" />
                  )}
                </div>

                {/* Order Date */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Order Date <span className="text-red-500">*</span></label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Order Status <span className="text-red-500">*</span></label>
                <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="Draft">Draft</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Confirmed">Confirmed</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 2: Products ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Products</p>

            <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-5">Product</div>
              <div className="col-span-2 text-center">Unit Price</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-2 text-center">Rate</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select value={item.product_id ?? ''} onChange={e => {
                      if (e.target.value === '') { updateRow(idx, 'product_id', null) }
                      else { onProductSelect(idx, e.target.value) }
                    }} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">Select product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {!item.product_id && (
                      <input type="text" value={item.product_name} onChange={e => updateRow(idx, 'product_name', e.target.value)}
                        placeholder="Or type name..."
                        className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </div>
                  <div className="col-span-2 text-center text-xs text-gray-400">
                    {item.product_id ? `₹${Number(products.find(p => p.id === item.product_id)?.price ?? 0).toFixed(0)}` : '—'}
                  </div>
                  <div className="col-span-1">
                    <input type="number" min="1" value={item.qty}
                      onChange={e => updateRow(idx, 'qty', Math.max(1, Number(e.target.value)))}
                      className="w-full border border-gray-200 rounded-lg px-1 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" min="0" step="0.01" value={item.rate}
                      onChange={e => updateRow(idx, 'rate', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-1 text-right text-sm font-medium text-gray-700">
                    ₹{(item.qty * item.rate).toFixed(0)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button onClick={() => removeRow(idx)} className="p-1 text-gray-400 hover:text-red-500 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addRow}
              className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-500 transition flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Row
            </button>

            <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-600">Total:</span>
              <span className="text-lg font-bold text-gray-900">{fmtAmount(total)}</span>
            </div>
          </div>

          {/* ── Section 3: Summary ── */}
          {selectedEntity && validItems.length > 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Order Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div><span className="text-gray-500">Entity: </span><span className="font-medium text-gray-800">{selectedEntity.name}</span></div>
                <div><span className="text-gray-500">Sales Exec: </span><span className="font-medium text-gray-800">
                  {hasSubordinates ? salesExecs.find(m => m.id === salesUserId)?.name ?? '—' : 'You'}
                </span></div>
                <div><span className="text-gray-500">Items: </span><span className="font-medium text-gray-800">{validItems.length}</span></div>
                <div><span className="text-gray-500">Total Qty: </span><span className="font-medium text-gray-800">{totalQty}</span></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Order Value</span>
                <span className="text-xl font-bold text-gray-900">{fmtAmount(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2 border-t border-gray-100 pt-4 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition">
            {saving ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OrderDetailDrawer
// ─────────────────────────────────────────────────────────────
function OrderDetailDrawer({ order, onClose, onStatusChange }: {
  order: OrderDetail
  onClose: () => void
  onStatusChange: () => void
}) {
  const { toast } = useToast()
  const [status, setStatus] = useState<'Draft' | 'Submitted' | 'Confirmed'>(order.status)
  const [saving, setSaving] = useState(false)

  async function updateStatus(newStatus: 'Draft' | 'Submitted' | 'Confirmed') {
    setSaving(true)
    const r = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!r.ok) {
      toast('Failed to update status', 'error')
    } else {
      setStatus(newStatus)
      toast('Status updated')
      onStatusChange()
    }
    setSaving(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[480px] max-w-full bg-white shadow-2xl border-l z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">
              {order.entity_name ?? (order.visit_id ? 'Meeting Order' : 'Direct Order')}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(order.order_date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">Entity</span>
              <span className="font-medium text-gray-800">{order.entity_name ?? '(Meeting-based)'}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">Type</span>
              <span className="font-medium text-gray-800">{order.entity_type ?? '—'}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">Sales Executive</span>
              <span className="font-medium text-gray-800">{order.users?.name ?? '—'}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">Source</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${order.order_source === 'direct' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {order.order_source === 'direct' ? 'Direct' : 'Meeting'}
              </span>
            </div>
          </div>

          {/* Status */}
          <div>
            <span className="text-xs text-gray-500 block mb-1">Status</span>
            <select value={status} onChange={e => updateStatus(e.target.value as typeof status)} disabled={saving}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50">
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Confirmed">Confirmed</option>
            </select>
          </div>

          {/* Items table */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Products</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-10 gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b">
                <div className="col-span-4">Product</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-center">Rate</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              {order.order_items.map(item => (
                <div key={item.id} className="grid grid-cols-10 gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 text-sm">
                  <div className="col-span-4 text-gray-800">{item.product_name}</div>
                  <div className="col-span-2 text-center text-gray-600">{item.qty}</div>
                  <div className="col-span-2 text-center text-gray-600">₹{Number(item.rate).toFixed(0)}</div>
                  <div className="col-span-2 text-right font-medium text-gray-800">₹{Number(item.amount).toFixed(0)}</div>
                </div>
              ))}
              {order.order_items.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-400 text-center">No items</div>
              )}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-gray-600">Total Order Value</span>
            <span className="text-xl font-bold text-gray-900">{fmtAmount(Number(order.total_amount))}</span>
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { toast } = useToast()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null)
  const [hasSubordinates, setHasSubordinates] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setHasSubordinates(d.hasSubordinates ?? false)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (hasSubordinates) {
      fetch('/api/orders/team').then(r => r.json()).then(d => {
        setTeamMembers(Array.isArray(d) ? d : [])
      }).catch(() => {})
    }
  }, [hasSubordinates])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter) params.set('status', statusFilter)
    if (userFilter) params.set('userId', userFilter)
    try {
      const r = await fetch(`/api/orders${params.toString() ? '?' + params.toString() : ''}`)
      const d = await r.json()
      setOrders(Array.isArray(d) ? d : [])
    } catch {
      toast('Failed to load orders', 'error')
    }
    setLoading(false)
  }, [dateFrom, dateTo, q, statusFilter, userFilter, toast])

  useEffect(() => { loadOrders() }, [loadOrders])

  async function openDetail(orderId: string) {
    const r = await fetch(`/api/orders/${orderId}`)
    if (!r.ok) { toast('Could not load order details', 'error'); return }
    const d = await r.json()
    setDetailOrder(d)
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Create Order
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <input type="text" placeholder="Search entity..." value={q} onChange={e => setQ(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Submitted</option>
          <option value="Confirmed">Confirmed</option>
        </select>
        {hasSubordinates && (
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Team</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {(dateFrom || dateTo || q || statusFilter || userFilter) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setQ(''); setStatusFilter(''); setUserFilter('') }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Sales Exec</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Source</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading orders...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No orders found</td></tr>
              ) : orders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(order.order_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{order.entity_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{order.entity_type ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{(order.users as { name?: string } | null)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                    {fmtAmount(Number(order.total_amount))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${order.order_source === 'direct' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {order.order_source === 'direct' ? 'Direct' : 'Meeting'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(order.id)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <CreateOrderModal
          onClose={() => setCreateOpen(false)}
          onSaved={loadOrders}
          hasSubordinates={hasSubordinates}
        />
      )}
      {detailOrder && (
        <OrderDetailDrawer
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onStatusChange={() => { loadOrders(); setDetailOrder(null) }}
        />
      )}
    </div>
  )
}
