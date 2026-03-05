'use client'

import { useState, useEffect, useCallback } from 'react'
import StatusBadge from '@/components/ui/StatusBadge'
import { useToast } from '@/contexts/ToastContext'

// ---- helpers ----
function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function buildWeekDays(monday: Date) { return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(monday, i))) }
function isToday(dateStr: string) { return dateStr === toDateStr(new Date()) }

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'long' })
  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleDateString('en-IN', { month: 'short' })
  return `${weekday}, ${day} ${month}`
}

function formatWeekRange(monday: Date) {
  const sun = addDays(monday, 6)
  const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })} ${d.getFullYear()}`
  return `${fmt(monday)} to ${fmt(sun)}`
}

type PlaceEntry = { id: string; place: string; dist: number; dealer: number; others: number }
type DayData = { [dateStr: string]: PlaceEntry[] }

type Plan = {
  id: string; status: string; submitted_at: string | null; manager_comment: string | null;
  weekly_plan_items: { plan_date: string; from_place: string; to_place: string; new_dealers_goal: number; existing_dealers_goal: number; mode_of_travel: string; notes: string }[]
  week_start_date: string; week_end_date: string
}

type LogEntry = { id: string; action_type: string; actor_role: string; timestamp: string; previous_status: string | null; new_status: string | null; comment: string | null; users?: { name: string } }

let _entryId = 0
function newEntryId() { return `e${++_entryId}` }

function planItemsToDayData(items: Plan['weekly_plan_items'], weekDays: string[]): DayData {
  const dd: DayData = {}
  for (const day of weekDays) dd[day] = []
  for (const item of items) {
    if (!dd[item.plan_date]) dd[item.plan_date] = []
    dd[item.plan_date].push({
      id: newEntryId(),
      place: item.from_place || '',
      dist: item.existing_dealers_goal ?? 0,
      dealer: item.new_dealers_goal ?? 0,
      others: 0,
    })
  }
  return dd
}

function dayDataToPlanItems(dayData: DayData) {
  const items: { plan_date: string; from_place: string; to_place: string; new_dealers_goal: number; existing_dealers_goal: number; mode_of_travel: string; notes: string }[] = []
  for (const [date, entries] of Object.entries(dayData)) {
    if (entries.length === 0) {
      items.push({ plan_date: date, from_place: '', to_place: '', new_dealers_goal: 0, existing_dealers_goal: 0, mode_of_travel: '', notes: '' })
    } else {
      for (const entry of entries) {
        items.push({
          plan_date: date,
          from_place: entry.place,
          to_place: '',
          new_dealers_goal: entry.dealer,
          existing_dealers_goal: entry.dist,
          mode_of_travel: '',
          notes: entry.others > 0 ? String(entry.others) : '',
        })
      }
    }
  }
  return items
}

// ---- My Plan Tab ----
function MyPlanTab({ userId }: { userId: string | null }) {
  const { toast } = useToast()
  const [monday, setMonday] = useState(() => getMondayOf(new Date()))
  const [plan, setPlan] = useState<Plan | null>(null)
  const [dayData, setDayData] = useState<DayData>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [villages, setVillages] = useState<{ id: string; label: string; name: string }[]>([])

  const weekStart = toDateStr(monday)
  const weekEnd = toDateStr(addDays(monday, 6))
  const weekDays = buildWeekDays(monday)

  // Load territory-based places for dropdown
  useEffect(() => {
    fetch('/api/masters/territory-mapping/places').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setVillages(d)
    }).catch(() => {})
  }, [])

  const loadPlan = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/weekly-plans/my?weekStart=${weekStart}`)
    const data = await r.json()
    setPlan(data)
    if (data && data.weekly_plan_items) {
      setDayData(planItemsToDayData(data.weekly_plan_items, weekDays))
    } else {
      const empty: DayData = {}
      for (const d of weekDays) empty[d] = []
      setDayData(empty)
    }
    setLoading(false)
  }, [weekStart])

  useEffect(() => { loadPlan() }, [loadPlan])

  async function loadLogs() {
    if (!plan) return
    const r = await fetch(`/api/weekly-plans/${plan.id}/logs`)
    setLogs(await r.json())
    setLogsOpen(true)
  }

  async function handleCreate() {
    setSaving(true)
    const items = dayDataToPlanItems(dayData)
    const r = await fetch('/api/weekly-plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start_date: weekStart, week_end_date: weekEnd, items })
    })
    if (!r.ok) { toast((await r.json()).error, 'error') } else { toast('Draft created'); loadPlan() }
    setSaving(false)
  }

  async function handleSaveDraft() {
    if (!plan) return
    setSaving(true)
    const items = dayDataToPlanItems(dayData)
    const r = await fetch(`/api/weekly-plans/${plan.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    })
    if (!r.ok) { toast((await r.json()).error, 'error') } else { toast('Saved'); loadPlan() }
    setSaving(false)
  }

  async function handleSubmit() {
    if (!plan) { await handleCreate(); return }
    if (['Draft', 'Rejected', 'Edited by Manager'].includes(plan.status)) {
      await handleSaveDraft()
    }
    setSaving(true)
    const r = await fetch(`/api/weekly-plans/${plan.id}/submit`, { method: 'POST' })
    if (!r.ok) { toast((await r.json()).error, 'error') } else { toast('Submitted!'); loadPlan() }
    setSaving(false)
  }

  const canEdit = !plan || ['Draft', 'Rejected', 'Edited by Manager'].includes(plan.status)

  function canAddPlace(dateStr: string): boolean {
    const entries = dayData[dateStr] || []
    if (entries.length === 0) return true
    return entries[entries.length - 1].place !== ''
  }

  function addPlace(dateStr: string) {
    setDayData(prev => ({
      ...prev,
      [dateStr]: [...(prev[dateStr] || []), { id: newEntryId(), place: '', dist: 0, dealer: 0, others: 0 }]
    }))
  }

  function removePlace(dateStr: string, entryId: string) {
    setDayData(prev => ({
      ...prev,
      [dateStr]: (prev[dateStr] || []).filter(e => e.id !== entryId)
    }))
  }

  function updatePlace(dateStr: string, entryId: string, field: keyof PlaceEntry, value: string | number) {
    const clamped = (field === 'dist' || field === 'dealer' || field === 'others') ? Math.max(0, Number(value) || 0) : value
    setDayData(prev => ({
      ...prev,
      [dateStr]: (prev[dateStr] || []).map(e => e.id === entryId ? { ...e, [field]: clamped } : e)
    }))
  }

  if (!userId) return <div className="text-center py-12 text-gray-400">Please add yourself as a user in Masters first.</div>

  return (
    <div className="flex flex-col h-full">
      {/* Page title */}
      <div className="flex items-center gap-3 mb-6">
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <h2 className="text-xl font-bold text-gray-900">Weekly Plan</h2>
        {plan && <StatusBadge status={plan.status} />}
        {plan && <button onClick={loadLogs} className="text-xs text-blue-600 hover:underline ml-auto">Audit Log</button>}
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-6 px-2">
        <button onClick={() => setMonday(d => addDays(d, -7))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">{formatWeekRange(monday)}</span>
        <button onClick={() => setMonday(d => addDays(d, 7))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Status banner for reviewed plans */}
      {plan && plan.status === 'Approved' && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Plan Approved
          </div>
          {plan.manager_comment && <p className="text-sm text-green-600 mt-1 ml-7">{plan.manager_comment}</p>}
        </div>
      )}
      {plan && plan.status === 'Rejected' && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Plan Rejected — Please revise and resubmit
          </div>
          {plan.manager_comment && <p className="text-sm text-red-600 mt-1 ml-7">{plan.manager_comment}</p>}
        </div>
      )}
      {plan && plan.status === 'Edited by Manager' && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
            Plan Edited by Manager — Review changes and resubmit
          </div>
          {plan.manager_comment && <p className="text-sm text-purple-600 mt-1 ml-7">{plan.manager_comment}</p>}
        </div>
      )}
      {plan && plan.status === 'On Hold' && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-yellow-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            Plan On Hold
          </div>
          {plan.manager_comment && <p className="text-sm text-yellow-600 mt-1 ml-7">{plan.manager_comment}</p>}
        </div>
      )}
      {plan && (plan.status === 'Submitted' || plan.status === 'Resubmitted') && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Awaiting manager review
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <>
          {/* Day cards */}
          <div className="flex-1 overflow-y-auto space-y-4 pb-24">
            {weekDays.map(dateStr => {
              const entries = dayData[dateStr] || []
              const today = isToday(dateStr)
              return (
                <div key={dateStr} className={`rounded-xl border bg-white overflow-hidden ${today ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                  {/* Day header */}
                  <div className="px-5 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{formatDayHeader(dateStr)}</h3>
                      {today && (
                        <span className="text-[11px] font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-md">Today</span>
                      )}
                    </div>
                  </div>

                  {/* Column headers */}
                  <div className="px-5 pb-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                      <span className="flex-1">Place</span>
                      <span className="w-[72px] text-center">Dist.</span>
                      <span className="w-[72px] text-center">Dealer</span>
                      <span className="w-[72px] text-center">Others</span>
                      <span className="w-8" />
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="px-5 pb-2 space-y-2">
                    {entries.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">No entries yet</p>
                    ) : (
                      entries.map(entry => (
                        <div key={entry.id} className="flex items-center gap-2">
                          <select
                            disabled={!canEdit}
                            value={entry.place}
                            onChange={e => updatePlace(dateStr, entry.id, 'place', e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 appearance-none"
                          >
                            <option value="">Select place…</option>
                            {villages.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                          </select>
                          <input type="number" min={0} disabled={!canEdit} value={entry.dist}
                            onChange={e => updatePlace(dateStr, entry.id, 'dist', Number(e.target.value))}
                            className="w-[72px] border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
                          <input type="number" min={0} disabled={!canEdit} value={entry.dealer}
                            onChange={e => updatePlace(dateStr, entry.id, 'dealer', Number(e.target.value))}
                            className="w-[72px] border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
                          <input type="number" min={0} disabled={!canEdit} value={entry.others}
                            onChange={e => updatePlace(dateStr, entry.id, 'others', Number(e.target.value))}
                            className="w-[72px] border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
                          {canEdit && (
                            <button onClick={() => removePlace(dateStr, entry.id)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Place button */}
                  {canEdit && (
                    canAddPlace(dateStr) ? (
                      <button onClick={() => addPlace(dateStr)}
                        className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-1 border-t border-gray-100">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Place
                      </button>
                    ) : (
                      <div className="w-full py-2 text-xs text-amber-600 text-center border-t border-gray-100 bg-amber-50/50">
                        Select a place in the previous row first
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>

          {/* Sticky footer */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-3 z-40">
            <div className="flex-1" />
            {canEdit && (
              <>
                <button onClick={plan ? handleSaveDraft : handleCreate} disabled={saving}
                  className="flex items-center justify-center gap-2 px-8 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition min-w-[180px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Save Draft
                </button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex items-center justify-center gap-2 px-8 py-3 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition min-w-[180px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  Submit Plan
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Audit Log Modal */}
      {logsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLogsOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-gray-800">Audit Log</h3>
              <button onClick={() => setLogsOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-3">
              {logs.map(log => (
                <div key={log.id} className="flex gap-3 text-sm">
                  <div className="w-1 bg-blue-200 rounded-full shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800">{log.action_type} <span className="text-gray-400 font-normal text-xs">by {log.users?.name ?? log.actor_role}</span></p>
                    {(log.previous_status || log.new_status) && <p className="text-xs text-gray-500">{log.previous_status} → {log.new_status}</p>}
                    {log.comment && <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5 mt-0.5">&ldquo;{log.comment}&rdquo;</p>}
                    <p className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && <p className="text-gray-400 text-sm">No log entries yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main Page ----
export default function WeeklyPlanPage() {
  const [me, setMe] = useState<{ userId: string | null; hasSubordinates: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMe({ userId: d.userId, hasSubordinates: d.hasSubordinates })).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full">
      <MyPlanTab userId={me?.userId ?? null} />
    </div>
  )
}
