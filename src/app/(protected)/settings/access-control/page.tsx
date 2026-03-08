'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { invalidateMeCache } from '@/hooks/useMe'

type UserEntry = { id: string; name: string; level: string }
type VisibilityEntry = { id: string; target_user_id: string; name: string; level: string }
type OrgRow = {
  viewer_user_id: string
  viewer_name: string
  viewer_level: string
  target_user_id: string
  target_name: string
  target_level: string
  target_manager_user_id: string | null
}
type OrgNode = {
  id: string
  name: string
  level: string
  isCrossTeam?: boolean
  children: OrgNode[]
}

// ─────────────────────────────────────────────────────────────────
// Page root — Suspense required for useSearchParams in Next.js 14
// ─────────────────────────────────────────────────────────────────
export default function AccessControlPage() {
  return (
    <Suspense>
      <AccessControlContent />
    </Suspense>
  )
}

function AccessControlContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get('tab') ?? 'schema'
  const preselected = searchParams.get('selectedUser') ?? null

  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', t)
    p.delete('selectedUser')
    router.push(`/settings/access-control?${p}`)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Access Control</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure who can view and interact with which users
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <TabButton active={tab === 'schema'} onClick={() => setTab('schema')}>
          Reporting Schema
        </TabButton>
        <TabButton active={tab === 'chart'} onClick={() => setTab('chart')}>
          Org Chart
        </TabButton>
        <TabButton active={tab === 'permissions'} onClick={() => setTab('permissions')}>
          Role Permissions
        </TabButton>
      </div>

      {tab === 'schema' ? (
        <ReportingSchema preselectedUserId={preselected} />
      ) : tab === 'chart' ? (
        <OrgChart />
      ) : (
        <RolePermissions />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Reporting Schema Tab
// ─────────────────────────────────────────────────────────────────
function ReportingSchema({ preselectedUserId }: { preselectedUserId: string | null }) {
  const [allUsers, setAllUsers] = useState<UserEntry[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null)
  const [visibility, setVisibility] = useState<VisibilityEntry[]>([])
  const [loadingVis, setLoadingVis] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [saved, setSaved] = useState(true)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    fetch('/api/masters/users')
      .then(r => r.json())
      .then((data: { id: string; name: string; levels?: { name: string } | null }[]) => {
        const users: UserEntry[] = (data ?? []).map(u => ({
          id: u.id,
          name: u.name,
          level: u.levels?.name ?? '',
        }))
        setAllUsers(users)
        if (preselectedUserId) {
          const found = users.find(u => u.id === preselectedUserId)
          if (found) setSelectedUser(found)
        }
      })
  }, [preselectedUserId])

  const loadVisibility = useCallback(async (userId: string) => {
    setLoadingVis(true)
    const r = await fetch(`/api/access-control/visibility?viewerId=${userId}`)
    const data = await r.json()
    setVisibility(Array.isArray(data) ? data : [])
    setLoadingVis(false)
  }, [])

  useEffect(() => {
    if (selectedUser) loadVisibility(selectedUser.id)
  }, [selectedUser, loadVisibility])

  const handleAddUser = async (targetUser: UserEntry) => {
    if (!selectedUser) return
    setSaved(false)
    const r = await fetch('/api/access-control/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId: selectedUser.id, targetId: targetUser.id }),
    })
    if (r.ok) {
      await loadVisibility(selectedUser.id)
      setAddSearch('')
    }
    setSaved(true)
  }

  const handleRemove = async (entry: VisibilityEntry) => {
    if (!selectedUser) return
    setSaved(false)
    setVisibility(v => v.filter(e => e.id !== entry.id))
    await fetch(`/api/access-control/visibility?id=${entry.id}`, { method: 'DELETE' })
    setSaved(true)
  }

  const handleImport = async () => {
    setImporting(true)
    setImportMsg('')
    const r = await fetch('/api/access-control/visibility/bulk-import', { method: 'POST' })
    const data = await r.json()
    setImporting(false)
    setImportMsg(`Imported ${data.inserted ?? 0} rules from hierarchy`)
    if (selectedUser) loadVisibility(selectedUser.id)
    setTimeout(() => setImportMsg(''), 4000)
  }

  const visibleTargetIds = new Set(visibility.map(v => v.target_user_id))
  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase())
  )
  const addCandidates = allUsers.filter(
    u =>
      u.id !== selectedUser?.id &&
      !visibleTargetIds.has(u.id) &&
      u.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : '⬇ Import from Hierarchy'}
          </button>
          {importMsg && <span className="text-xs text-green-600">{importMsg}</span>}
        </div>
        <span className={`text-xs ${saved ? 'text-green-600' : 'text-orange-500'}`}>
          {saved ? 'All changes saved ✓' : 'Saving...'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 h-[600px]">
        {/* Left panel */}
        <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Select User
            </p>
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                  selectedUser?.id === u.id ? 'bg-blue-50' : ''
                }`}
              >
                <Avatar name={u.name} />
                <span className="text-sm font-medium flex-1 truncate">{u.name}</span>
                {u.level && <LevelBadge level={u.level} />}
                {selectedUser?.id === u.id && (
                  <span className="text-blue-500 text-xs font-bold">●</span>
                )}
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No users found</p>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Can View &amp; Interact With
            </p>
            {selectedUser && (
              <div className="relative">
                <input
                  type="text"
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Search to add users..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {addSearch && addCandidates.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {addCandidates.map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleAddUser(u)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <Avatar name={u.name} />
                        <span className="flex-1">{u.name}</span>
                        {u.level && <LevelBadge level={u.level} />}
                      </button>
                    ))}
                  </div>
                )}
                {addSearch && addCandidates.length === 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow mt-1 px-3 py-2 text-sm text-gray-400">
                    No users to add
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!selectedUser && (
              <p className="text-sm text-gray-400 text-center py-12 px-4">
                ← Select a user to configure their visibility
              </p>
            )}
            {selectedUser && loadingVis && (
              <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
            )}
            {selectedUser && !loadingVis && visibility.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12 px-4">
                No users configured. Add users above or import from hierarchy.
              </p>
            )}
            {selectedUser &&
              !loadingVis &&
              visibility.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg group"
                >
                  <span className="text-green-500 text-xs">✓</span>
                  <Avatar name={entry.name} />
                  <span className="text-sm font-medium flex-1 truncate">{entry.name}</span>
                  {entry.level && <LevelBadge level={entry.level} />}
                  <button
                    onClick={() => handleRemove(entry)}
                    className="text-gray-300 group-hover:text-red-400 hover:text-red-500 text-base leading-none ml-1 transition-colors"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Org Chart Tab
// ─────────────────────────────────────────────────────────────────
function OrgChart() {
  const router = useRouter()
  const [rows, setRows] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/access-control/visibility/all')
      .then(r => r.json())
      .then(data => {
        setRows(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const tree = buildTree(rows)
  const q = search.toLowerCase()
  const filtered = q ? tree.filter(n => nodeMatchesSearch(n, q)) : tree

  const configure = (userId: string) => {
    router.push(`/settings/access-control?selectedUser=${userId}`)
  }

  if (loading)
    return <p className="text-sm text-gray-400 py-8 text-center">Loading org chart...</p>

  if (rows.length === 0)
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        No visibility rules configured. Set them up in the Reporting Schema tab.
      </p>
    )

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search user..."
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>
      <div className="space-y-1">
        {filtered.map(node => (
          <OrgNodeView
            key={node.id}
            node={node}
            depth={0}
            search={q}
            onConfigure={configure}
          />
        ))}
        {filtered.length === 0 && q && (
          <p className="text-sm text-gray-400 py-4 text-center">No users match &ldquo;{search}&rdquo;</p>
        )}
      </div>
    </div>
  )
}

function buildTree(rows: OrgRow[]): OrgNode[] {
  const visMap: Record<string, OrgRow[]> = {}
  const metaMap: Record<string, { name: string; level: string }> = {}

  for (const row of rows) {
    if (!visMap[row.viewer_user_id]) visMap[row.viewer_user_id] = []
    visMap[row.viewer_user_id].push(row)
    metaMap[row.viewer_user_id] ??= { name: row.viewer_name, level: row.viewer_level }
    metaMap[row.target_user_id] ??= { name: row.target_name, level: row.target_level }
  }

  const targetSet = new Set(rows.map(r => r.target_user_id))
  const roots = Object.keys(visMap).filter(id => !targetSet.has(id))

  const buildNode = (viewerId: string, visited: Set<string>): OrgNode => {
    const meta = metaMap[viewerId] ?? { name: 'Unknown', level: '' }
    if (visited.has(viewerId)) return { id: viewerId, name: meta.name, level: meta.level, children: [] }
    const nextVisited = new Set(visited)
    nextVisited.add(viewerId)

    const children: OrgNode[] = (visMap[viewerId] ?? []).map(row => {
      const child = visMap[row.target_user_id]
        ? buildNode(row.target_user_id, nextVisited)
        : { id: row.target_user_id, name: row.target_name, level: row.target_level, children: [] }
      return { ...child, isCrossTeam: row.target_manager_user_id !== viewerId }
    })

    return { id: viewerId, name: meta.name, level: meta.level, children }
  }

  return roots.map(id => buildNode(id, new Set()))
}

function nodeMatchesSearch(node: OrgNode, q: string): boolean {
  if (node.name.toLowerCase().includes(q)) return true
  return node.children.some(c => nodeMatchesSearch(c, q))
}

function OrgNodeView({
  node,
  depth,
  search,
  onConfigure,
}: {
  node: OrgNode
  depth: number
  search: string
  onConfigure: (id: string) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  const matches = search && node.name.toLowerCase().includes(search)

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-gray-200 pl-4' : ''}>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors ${
          matches ? 'bg-yellow-50' : ''
        }`}
      >
        <Avatar name={node.name} />
        <span className="font-medium text-sm">{node.name}</span>
        {node.level && <LevelBadge level={node.level} />}
        {node.isCrossTeam && (
          <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
            cross-team
          </span>
        )}
        <button
          onClick={() => onConfigure(node.id)}
          className="ml-auto text-xs text-blue-500 hover:underline flex-shrink-0"
        >
          Configure ↗
        </button>
        {node.children.length > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-gray-400 hover:text-gray-600 text-xs w-5 text-center flex-shrink-0"
          >
            {open ? '▼' : '▶'}
          </button>
        )}
      </div>
      {open &&
        node.children.map(child => (
          <OrgNodeView
            key={child.id + '-child-' + node.id}
            node={child}
            depth={depth + 1}
            search={search}
            onConfigure={onConfigure}
          />
        ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500',
]

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <div
      className={`w-6 h-6 ${color} rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0`}
    >
      {initials}
    </div>
  )
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
      {level}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// Role Permissions Tab
// ─────────────────────────────────────────────────────────────────
type SectionPerms = { view: boolean; edit: boolean; delete: boolean }
type PermMap = Record<string, SectionPerms>

const PERM_SECTIONS: { key: string; label: string }[] = [
  { key: 'locations', label: 'Locations' },
  { key: 'business', label: 'Business' },
  { key: 'products', label: 'Products' },
  { key: 'organization', label: 'Organization' },
  { key: 'users', label: 'Users' },
]

function RolePermissions() {
  const [perms, setPerms] = useState<PermMap>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/role-permissions')
      .then(r => r.json())
      .then((d: PermMap) => setPerms(d))
  }, [])

  async function toggle(section: string, action: 'view' | 'edit' | 'delete', value: boolean) {
    const current = perms[section] ?? { view: false, edit: false, delete: false }
    let next = { ...current, [action]: value }

    // Cascade: enabling edit/delete → enable view
    if ((action === 'edit' || action === 'delete') && value) next.view = true
    // Cascade: disabling view → disable edit and delete
    if (action === 'view' && !value) { next.edit = false; next.delete = false }

    setPerms(p => ({ ...p, [section]: next }))
    setSaving(section)
    await fetch('/api/settings/role-permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, can_view: next.view, can_edit: next.edit, can_delete: next.delete }),
    })
    setSaving(null)
    invalidateMeCache()
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-800">Standard Role Permissions</h2>
        <p className="text-xs text-gray-500 mt-0.5">Configure what Standard users can do in each section.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Section</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">View</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Edit</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Delete</th>
            </tr>
          </thead>
          <tbody>
            {PERM_SECTIONS.map(s => {
              const p = perms[s.key] ?? { view: false, edit: false, delete: false }
              return (
                <tr key={s.key} className="border-t border-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {s.label}
                    {saving === s.key && <span className="ml-2 text-xs text-orange-500">Saving…</span>}
                  </td>
                  {(['view', 'edit', 'delete'] as const).map(action => (
                    <td key={action} className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(s.key, action, !p[action])}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          p[action] ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          p[action] ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1">
        <p className="text-xs text-gray-400">Administrator always has full access to all sections.</p>
        <p className="text-xs text-gray-400">Access Control is always Administrator-only and is not configurable.</p>
      </div>
    </div>
  )
}
