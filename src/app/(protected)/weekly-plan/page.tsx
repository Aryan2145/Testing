'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import StatusBadge from '@/components/ui/StatusBadge'
import Modal from '@/components/ui/Modal'
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
type ReviewPlan = Plan & { users: { id: string; name: string; contact: string } }
type CellData = { status: string | null; planned_days: number }
type SubSummary = { id: string; name: string; weeks: Record<string, CellData> }
type SummaryData = { weeks: string[]; subordinates: SubSummary[] }

let _entryId = 0
function newEntryId() { return `e${++_entryId}` }

// ---- Summary Grid ----
function SummaryGrid({ data, todayMondayStr }: { data: SummaryData; todayMondayStr: string }) {
  function cellStyle(cell: CellData, weekStart: string): { cls: string; label: string } {
    const isFuture = weekStart > todayMondayStr
    if (!cell.status || cell.status === 'Draft') {
      if (isFuture) return { cls: 'bg-gray-100 text-gray-400', label: '—' }
      return { cls: 'bg-red-100 text-red-600 font-semibold', label: '—' }
    }
    if (cell.planned_days >= 7) return { cls: 'bg-green-100 text-green-700 font-semibold', label: '✓' }
    return { cls: 'bg-yellow-100 text-yellow-700 font-semibold', label: `${cell.planned_days}/7` }
  }

  function weekLabel(weekStr: string) {
    const d = new Date(weekStr + 'T00:00:00')
    return `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-200 inline-block" />All planned</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" />Partial (days/7)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block" />Not submitted</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200 inline-block" />Future / unplanned</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-semibold text-gray-700 border-r border-gray-200 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                Employee
              </th>
              {data.weeks.map(w => (
                <th
                  key={w}
                  className={`px-2 py-2.5 text-center font-medium border-r border-gray-200 min-w-[56px] whitespace-nowrap ${w === todayMondayStr ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}
                >
                  {weekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.subordinates.map((sub, idx) => (
              <tr key={sub.id} className={`border-b border-gray-100 ${idx % 2 !== 0 ? 'bg-gray-50/50' : 'bg-white'}`}>
                <td className={`px-4 py-2.5 font-medium text-gray-800 border-r border-gray-200 sticky left-0 z-10 ${idx % 2 !== 0 ? 'bg-gray-50' : 'bg-white'}`}>
                  {sub.name}
                </td>
                {data.weeks.map(w => {
                  const cell = sub.weeks[w] ?? { status: null, planned_days: 0 }
                  const { cls, label } = cellStyle(cell, w)
                  return (
                    <td key={w} className={`px-2 py-2.5 text-center border-r border-gray-100 ${cls}`}>
                      {label}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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
    setDayData(prev => ({
      ...prev,
      [dateStr]: (prev[dateStr] || []).map(e => e.id === entryId ? { ...e, [field]: value } : e)
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

      {/* Manager comment */}
      {plan?.manager_comment && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          <strong>Manager Comment:</strong> {plan.manager_comment}
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
                          <input type="number" disabled={!canEdit} value={entry.dist}
                            onChange={e => updatePlace(dateStr, entry.id, 'dist', Number(e.target.value))}
                            className="w-[72px] border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
                          <input type="number" disabled={!canEdit} value={entry.dealer}
                            onChange={e => updatePlace(dateStr, entry.id, 'dealer', Number(e.target.value))}
                            className="w-[72px] border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
                          <input type="number" disabled={!canEdit} value={entry.others}
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

// ---- Review Plans Tab ----
function ReviewTab() {
  const { toast } = useToast()
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [plans, setPlans] = useState<ReviewPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterWeek, setFilterWeek] = useState('')
  const [selected, setSelected] = useState<ReviewPlan | null>(null)
  const [commentModal, setCommentModal] = useState<{ action: string; planId: string } | null>(null)
  const [comment, setComment] = useState('')
  const [acting, setActing] = useState(false)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const todayMondayStr = toDateStr(getMondayOf(new Date()))

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    const r = await fetch('/api/weekly-plans/summary')
    const d = await r.json()
    setSummary(d?.subordinates ? d : { weeks: [], subordinates: [] })
    setSummaryLoading(false)
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  const loadPlans = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterEmployee) params.set('userId', filterEmployee)
    if (filterWeek) params.set('weekStart', filterWeek)
    const r = await fetch(`/api/weekly-plans/review?${params}`)
    const d = await r.json()
    setPlans(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [filterStatus, filterEmployee, filterWeek])

  useEffect(() => { loadPlans() }, [loadPlans])

  const weekOptions = useMemo(() => {
    const opts: string[] = []
    const currentMonday = getMondayOf(new Date())
    for (let i = 11; i >= 0; i--) opts.push(toDateStr(addDays(currentMonday, -7 * i)))
    return opts
  }, [])

  async function action(planId: string, type: string, body: Record<string, unknown> = {}) {
    setActing(true)
    const r = await fetch(`/api/weekly-plans/${planId}/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    if (!r.ok) { toast(d.error, 'error') } else { toast(`Action: ${type} done`); loadPlans(); setSelected(null) }
    setActing(false)
  }

  const STATUS_OPTS = ['', 'Submitted', 'Approved', 'Rejected', 'On Hold', 'Edited by Manager', 'Resubmitted']
  const subordinates = summary?.subordinates ?? []

  return (
    <div>
      {/* View toggle + filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* List / Grid toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mr-1">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-xs font-medium transition ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            List
          </button>
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-1.5 text-xs font-medium transition ${view === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Weekly Grid
          </button>
        </div>

        {view === 'list' && (
          <>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
            </select>

            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All employees</option>
              {subordinates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All weeks</option>
              {weekOptions.map(w => <option key={w} value={w}>{formatWeekRange(new Date(w + 'T00:00:00'))}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Grid view */}
      {view === 'grid' ? (
        summaryLoading || !summary ? (
          <div className="text-center py-12 text-gray-400">Loading weekly grid…</div>
        ) : summary.subordinates.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No subordinates found.</div>
        ) : (
          <SummaryGrid data={summary} todayMondayStr={todayMondayStr} />
        )
      ) : (
        /* List view */
        loading ? <div className="text-center py-12 text-gray-400">Loading…</div> : plans.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No plans to review.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Employee</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Week</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Submitted</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{p.users.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.week_start_date} — {p.week_end_date}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.submitted_at ? new Date(p.submitted_at).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(p)} className="text-blue-600 hover:underline text-xs font-medium">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Plan Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-800">{selected.users.name} — Week of {selected.week_start_date}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={selected.status} />
                  {selected.submitted_at && (
                    <span className="text-xs text-gray-400">Submitted {new Date(selected.submitted_at).toLocaleString('en-IN')}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            {selected.manager_comment && (
              <div className="mx-6 mt-4 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
                Comment: {selected.manager_comment}
              </div>
            )}
            <div className="overflow-x-auto px-6 py-4 flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>{['Date', 'Place', 'Dist.', 'Dealer', 'Others'].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {selected.weekly_plan_items.sort((a, b) => a.plan_date.localeCompare(b.plan_date)).map((item, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-medium">{formatDayHeader(item.plan_date)}</td>
                      <td className="px-3 py-2">{item.from_place || '—'}</td>
                      <td className="px-3 py-2">{item.existing_dealers_goal}</td>
                      <td className="px-3 py-2">{item.new_dealers_goal}</td>
                      <td className="px-3 py-2">{item.notes || '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {['Submitted', 'Resubmitted', 'On Hold'].includes(selected.status) && (
              <div className="px-6 py-4 border-t flex flex-wrap gap-2">
                <button disabled={acting} onClick={() => { setCommentModal({ action: 'approve', planId: selected.id }); setComment('') }}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Approve</button>
                <button disabled={acting} onClick={() => { setCommentModal({ action: 'reject', planId: selected.id }); setComment('') }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Reject</button>
                <button disabled={acting} onClick={() => { setCommentModal({ action: 'hold', planId: selected.id }); setComment('') }}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Hold</button>
                <button disabled={acting} onClick={() => { setCommentModal({ action: 'suggest', planId: selected.id }); setComment('') }}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">Suggest Changes</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comment Modal */}
      <Modal
        title={commentModal?.action === 'approve' ? 'Approve Plan' : commentModal?.action === 'reject' ? 'Reject Plan' : commentModal?.action === 'hold' ? 'Put On Hold' : 'Suggest Changes'}
        isOpen={!!commentModal} onClose={() => setCommentModal(null)}
        onSave={() => { if (commentModal) action(commentModal.planId, commentModal.action, { comment }) }}
        isSaving={acting} saveLabel="Confirm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comment {commentModal?.action === 'reject' || commentModal?.action === 'suggest' ? '(required)' : '(optional)'}
          </label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder={commentModal?.action === 'approve' ? 'Add an optional note for approval…' : 'Enter your comment…'} />
        </div>
      </Modal>
    </div>
  )
}

// ---- Main Page ----
export default function WeeklyPlanPage() {
  const [tab, setTab] = useState<'my' | 'review'>('my')
  const [me, setMe] = useState<{ userId: string | null; hasSubordinates: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMe({ userId: d.userId, hasSubordinates: d.hasSubordinates })).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center gap-4 mb-6 border-b border-gray-200">
        <button onClick={() => setTab('my')} className={`pb-3 text-sm font-medium border-b-2 transition ${tab === 'my' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          My Weekly Plans
        </button>
        {me?.hasSubordinates && (
          <button onClick={() => setTab('review')} className={`pb-3 text-sm font-medium border-b-2 transition ${tab === 'review' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Review Plans
          </button>
        )}
      </div>
      {tab === 'my' ? <MyPlanTab userId={me?.userId ?? null} /> : <ReviewTab />}
    </div>
  )
}
