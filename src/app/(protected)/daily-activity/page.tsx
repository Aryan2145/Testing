'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/contexts/ToastContext'

type Visit = {
  id: string
  visit_type: 'Dealer' | 'Distributor'
  entity_name: string
  is_new_entity: boolean
  status: 'Pending' | 'Active' | 'Completed'
  start_time: string | null
  end_time: string | null
  duration_secs: number | null
  latitude: number | null
  longitude: number | null
  address: string | null
}

type Entity = { id: string; name: string }

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

// ---- Visit Card ----
function VisitCard({ visit, onStart, onStop, onDelete }: {
  visit: Visit
  onStart: (id: string) => void
  onStop: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (visit.status === 'Active' && visit.start_time) {
      const update = () => setElapsed(Math.floor((Date.now() - new Date(visit.start_time!).getTime()) / 1000))
      update()
      intervalRef.current = setInterval(update, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setElapsed(visit.duration_secs ?? 0)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [visit.status, visit.start_time, visit.duration_secs])

  const typeColor = visit.visit_type === 'Dealer'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-green-100 text-green-700'

  const statusColor = visit.status === 'Active'
    ? 'bg-amber-100 text-amber-700'
    : visit.status === 'Completed'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-gray-100 text-gray-500'

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all ${visit.status === 'Active' ? 'border-amber-300 shadow-md shadow-amber-50' : 'border-gray-200'}`}>
      {/* Active pulse bar */}
      {visit.status === 'Active' && (
        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400 animate-pulse" />
      )}
      {visit.status === 'Completed' && (
        <div className="h-1 bg-emerald-400" />
      )}

      <div className="px-5 py-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeColor}`}>{visit.visit_type}</span>
              {visit.is_new_entity && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">New</span>}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{visit.status}</span>
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-gray-900 truncate">{visit.entity_name}</h3>
          </div>

          {/* Timer / Action button */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            {visit.status === 'Pending' && (
              <button onClick={() => onStart(visit.id)}
                className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center shadow transition">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            )}
            {visit.status === 'Active' && (
              <>
                <button onClick={() => onStop(visit.id)}
                  className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow transition">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                </button>
                <span className="text-xs font-mono font-bold text-amber-600 tabular-nums">{formatDuration(elapsed)}</span>
              </>
            )}
            {visit.status === 'Completed' && (
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="mt-3 space-y-1">
          {visit.start_time && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Started {formatTime(visit.start_time)}</span>
              {visit.end_time && <span>· Ended {formatTime(visit.end_time)}</span>}
            </div>
          )}
          {visit.status === 'Completed' && visit.duration_secs != null && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Duration: {formatDuration(visit.duration_secs)}
            </div>
          )}
          {visit.latitude && visit.longitude && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="truncate">{visit.address ?? `${visit.latitude.toFixed(4)}, ${visit.longitude.toFixed(4)}`}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Add Visit Modal ----
function AddVisitModal({ onClose, onAdd }: { onClose: () => void; onAdd: (v: Partial<Visit>) => void }) {
  const [visitType, setVisitType] = useState<'Dealer' | 'Distributor'>('Dealer')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [entityId, setEntityId] = useState('')
  const [entityName, setEntityName] = useState('')
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setEntityId(''); setEntityName('')
    setLoading(true)
    const path = visitType === 'Dealer' ? '/api/masters/dealers' : '/api/masters/distributors'
    fetch(path).then(r => r.json()).then(d => {
      setEntities(Array.isArray(d) ? d : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [visitType])

  function handleAdd() {
    if (mode === 'existing' && !entityId) return
    if (mode === 'new' && !entityName.trim()) return
    const selected = entities.find(e => e.id === entityId)
    onAdd({
      visit_type: visitType,
      entity_id: mode === 'existing' ? entityId : undefined,
      entity_name: mode === 'existing' ? (selected?.name ?? '') : entityName.trim(),
      is_new_entity: mode === 'new',
    } as Partial<Visit>)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Add Visit</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Visit type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Visit Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['Dealer', 'Distributor'] as const).map(t => (
                <button key={t} onClick={() => setVisitType(t)}
                  className={`py-2.5 rounded-xl text-sm font-medium border-2 transition ${visitType === t ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Existing or New */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select or Create</label>
            <div className="grid grid-cols-2 gap-2">
              {(['existing', 'new'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`py-2.5 rounded-xl text-sm font-medium border-2 transition capitalize ${mode === m ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {m === 'existing' ? 'Existing' : 'New / Ad-hoc'}
                </button>
              ))}
            </div>
          </div>

          {/* Entity selector */}
          {mode === 'existing' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select {visitType}
              </label>
              {loading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : (
                <select value={entityId} onChange={e => setEntityId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">Select {visitType}...</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              )}
              {entities.length === 0 && !loading && (
                <p className="text-xs text-amber-600 mt-1">No {visitType.toLowerCase()}s found in masters. Add them first or use &quot;New / Ad-hoc&quot;.</p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {visitType} Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={entityName} onChange={e => setEntityName(e.target.value)}
                placeholder={`Enter ${visitType.toLowerCase()} name`}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={handleAdd}
            disabled={(mode === 'existing' && !entityId) || (mode === 'new' && !entityName.trim())}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition">
            Add Visit
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function DailyActivityPage() {
  const { toast } = useToast()
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [acting, setActing] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const displayDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/daily-activity?date=${today}`)
    if (r.ok) setVisits(await r.json())
    setLoading(false)
  }, [today])

  useEffect(() => { load() }, [load])

  async function handleAdd(partial: Partial<Visit>) {
    const r = await fetch('/api/daily-activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...partial, visit_date: today }),
    })
    if (!r.ok) { toast((await r.json()).error, 'error'); return }
    setShowModal(false)
    load()
  }

  async function handleStart(id: string) {
    if (acting) return
    setActing(true)

    // Get geolocation first
    let latitude: number | null = null
    let longitude: number | null = null
    let address: string | null = null

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      )
      latitude = pos.coords.latitude
      longitude = pos.coords.longitude
      // Reverse geocode using a free endpoint
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
        const geoData = await geo.json()
        address = geoData.display_name ?? null
      } catch { /* ignore */ }
    } catch {
      toast('Location unavailable — starting without GPS', 'info')
    }

    const r = await fetch(`/api/daily-activity/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', latitude, longitude, address }),
    })
    if (!r.ok) { toast((await r.json()).error, 'error') } else { load() }
    setActing(false)
  }

  async function handleStop(id: string) {
    if (acting) return
    setActing(true)
    const r = await fetch(`/api/daily-activity/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    })
    if (!r.ok) { toast((await r.json()).error, 'error') } else { load() }
    setActing(false)
  }

  async function handleDelete(id: string) {
    const r = await fetch(`/api/daily-activity/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    })
    if (!r.ok) { toast((await r.json()).error, 'error') } else { load() }
  }

  const activeVisit = visits.find(v => v.status === 'Active')
  const completed = visits.filter(v => v.status === 'Completed').length

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Daily Activity</h2>
          <p className="text-sm text-gray-500 mt-0.5">{displayDate}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-200 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      {visits.length > 0 && (
        <div className="flex items-center gap-4 mb-5 px-4 py-3 bg-gray-50 rounded-xl text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span>{visits.length} visit{visits.length !== 1 ? 's' : ''}</span>
          </div>
          {activeVisit && (
            <div className="flex items-center gap-1.5 text-amber-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>1 active</span>
            </div>
          )}
          {completed > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{completed} completed</span>
            </div>
          )}
        </div>
      )}

      {/* Visit cards */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No visits today</p>
          <p className="text-sm text-gray-400 mt-1">Tap + to log your first visit</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visits.map(visit => (
            <VisitCard key={visit.id} visit={visit}
              onStart={handleStart} onStop={handleStop} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Add Visit Modal */}
      {showModal && <AddVisitModal onClose={() => setShowModal(false)} onAdd={handleAdd} />}
    </div>
  )
}
