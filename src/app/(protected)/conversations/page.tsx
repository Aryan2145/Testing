'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Conversation = {
  context_type: string
  context_id: string
  last_remark: string
  last_body: string
  last_author: string
  count: number
  updated_at: string
  unread_count: number
}

type UserOption = { id: string; name: string }

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const SECTION_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  expense: 'Expense',
  weekly_plan_day: 'Weekly Plan',
}

const SECTION_COLORS: Record<string, string> = {
  meeting: 'bg-blue-100 text-blue-700',
  expense: 'bg-orange-100 text-orange-700',
  weekly_plan_day: 'bg-purple-100 text-purple-700',
}

function getRedirectPath(conv: Conversation) {
  if (conv.context_type === 'meeting') {
    return `/daily-activity?remarks=${conv.context_id}`
  }
  if (conv.context_type === 'expense') {
    return `/daily-activity?tab=expenses&remarks=${conv.context_id}`
  }
  if (conv.context_type === 'weekly_plan_day') {
    return `/weekly-plan?remarks=${conv.context_id}`
  }
  return '/'
}

export default function ConversationsPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserOption[]>([])

  // Filters
  const [section, setSection] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (section) p.set('section', section)
    if (userId) p.set('userId', userId)
    if (status !== 'all') p.set('status', status)
    const r = await fetch(`/api/conversations?${p}`)
    if (r.ok) setConversations(await r.json())
    setLoading(false)
  }, [section, userId, status])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // Load subordinates for user filter (managers have subordinates)
    fetch('/api/review/summary-cards').then(r => r.json()).then((cards: { id: string; name: string }[]) => {
      if (Array.isArray(cards)) setUsers(cards)
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Conversations</h2>
        {conversations.length > 0 && (
          <span className="text-sm text-gray-500">{conversations.length} thread{conversations.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All sections</option>
          <option value="meeting">Meetings</option>
          <option value="expense">Expenses</option>
          <option value="weekly_plan">Weekly Plan</option>
        </select>

        {users.length > 0 && (
          <select value={userId} onChange={e => setUserId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        <select value={status} onChange={e => setStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No conversations yet</p>
          <p className="text-sm text-gray-400 mt-1">Remarks on meetings, expenses and plans will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => (
            <button
              key={`${conv.context_type}::${conv.context_id}`}
              onClick={() => router.push(getRedirectPath(conv))}
              className="w-full text-left bg-white rounded-2xl border border-gray-200 px-5 py-4 hover:border-blue-200 hover:shadow-sm transition"
            >
              <div className="flex items-start gap-3">
                {/* Avatar placeholder */}
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SECTION_COLORS[conv.context_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {SECTION_LABELS[conv.context_type] ?? conv.context_type}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">{formatRelative(conv.updated_at)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500 truncate">
                      <span className="font-medium text-gray-700">{conv.last_author}:</span>{' '}
                      {conv.last_body}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="shrink-0 ml-auto w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-1">{conv.count} remark{conv.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
