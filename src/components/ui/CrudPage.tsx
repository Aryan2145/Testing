'use client'

import { ReactNode, useState, useEffect, useRef, useCallback } from 'react'
import Toggle from './Toggle'
import Pagination from './Pagination'

export interface Column {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => ReactNode
}

interface CrudPageProps {
  title: string
  headerExtra?: ReactNode
  backHref?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  allRowsCount: number
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  page: number
  totalPages: number
  onPage: (p: number) => void
  onAdd?: () => void
  onEdit?: (row: Record<string, unknown>) => void
  onDelete?: (row: Record<string, unknown>) => Promise<string | null | void> | void
  rowActions?: (row: Record<string, unknown>) => ReactNode
  onToggleActive?: (row: Record<string, unknown>, val: boolean) => void
  /** When provided, rows get a drag handle and can be reordered. Receives the full new order. */
  onReorder?: (newRows: Record<string, unknown>[]) => void
  showActive?: boolean
  addLabel?: string
  filterBar?: ReactNode
}

export default function CrudPage({
  title, headerExtra, backHref, columns, rows, allRowsCount, isLoading, search, onSearchChange,
  page, totalPages, onPage, onAdd, onEdit, onDelete, rowActions, onToggleActive, onReorder,
  showActive = true, addLabel = '+ Add', filterBar,
}: CrudPageProps) {
  // Local ordered rows for drag-and-drop (only used when onReorder is set)
  const [orderedRows, setOrderedRows] = useState<Record<string, unknown>[]>(rows)
  useEffect(() => { setOrderedRows(rows) }, [rows])

  // Delete error banner
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState(0)
  const errTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showDeleteError = useCallback((msg: string) => {
    if (errTimerRef.current) clearTimeout(errTimerRef.current)
    setDeleteError(msg)
    setErrorKey(k => k + 1)
    errTimerRef.current = setTimeout(() => setDeleteError(null), 5000)
  }, [])

  const clearDeleteError = useCallback(() => {
    if (errTimerRef.current) clearTimeout(errTimerRef.current)
    setDeleteError(null)
  }, [])

  const dragIdx    = useRef<number | null>(null)
  const dragOverIdx = useRef<number | null>(null)

  function handleDragStart(idx: number) { dragIdx.current = idx }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    dragOverIdx.current = idx
  }

  function handleDrop() {
    const from = dragIdx.current
    const to   = dragOverIdx.current
    if (from === null || to === null || from === to) return
    const next = [...orderedRows]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrderedRows(next)
    onReorder?.(next)
    dragIdx.current = null
    dragOverIdx.current = null
  }

  const displayRows = onReorder ? orderedRows : rows
  const colSpan = columns.length + (showActive ? 2 : 1) + (onReorder ? 1 : 0)

  return (
    <div>
      {backHref && (
        <a href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 group">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Back to Masters
        </a>
      )}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          {headerExtra}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            {addLabel}
          </button>
        )}
      </div>

      <div className="mb-3">
        <input
          type="text" placeholder="Search…" value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {filterBar && <div className="mb-3">{filterBar}</div>}

      {deleteError && (
        <div key={errorKey} className="mb-4 bg-red-50 border border-red-200 rounded-lg overflow-hidden">
          <div className="flex items-start gap-3 px-4 py-3">
            <p className="text-red-800 text-sm font-medium flex-1 leading-snug">{deleteError}</p>
            <button
              onClick={clearDeleteError}
              className="text-red-400 hover:text-red-700 text-xl leading-none flex-shrink-0 transition-colors"
              aria-label="Close"
            >×</button>
          </div>
          <div className="h-1 bg-red-100">
            <div className="bg-red-500 h-full" style={{ animation: 'toast-progress 5s linear forwards' }} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {onReorder && <th className="w-8 px-3 py-3" />}
              {columns.map(c => (
                <th key={c.key} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{c.label}</th>
              ))}
              {showActive && <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>}
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={colSpan} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : displayRows.length === 0 ? (
              <tr><td colSpan={colSpan} className="text-center py-12 text-gray-400">No records found.</td></tr>
            ) : displayRows.map((row, i) => (
              <tr
                key={String(row.id ?? i)}
                className="border-t border-gray-50 hover:bg-gray-50"
                draggable={!!onReorder}
                onDragStart={onReorder ? () => handleDragStart(i) : undefined}
                onDragOver={onReorder ? e => handleDragOver(e, i) : undefined}
                onDrop={onReorder ? handleDrop : undefined}
              >
                {onReorder && (
                  <td className="px-3 py-3 cursor-grab text-gray-300 hover:text-gray-500 select-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 6h16.5m-16.5 6h16.5" />
                    </svg>
                  </td>
                )}
                {columns.map(c => (
                  <td key={c.key} className="px-4 py-3 text-gray-700">
                    {c.render ? c.render(row) : String(row[c.key] ?? '')}
                  </td>
                ))}
                {showActive && onToggleActive && (
                  <td className="px-4 py-3">
                    <Toggle checked={Boolean(row.is_active)} onChange={v => onToggleActive(row, v)} />
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {onEdit && (
                      <button onClick={() => onEdit(row)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                    )}
                    {rowActions?.(row)}
                    {onDelete && (
                      <button
                        onClick={async () => {
                          if (confirm('Delete this record?')) {
                            const result = await onDelete(row)
                            if (typeof result === 'string' && result) showDeleteError(result)
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPage={onPage} totalRows={allRowsCount} />
    </div>
  )
}
