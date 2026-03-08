'use client'

import { ReactNode } from 'react'
import Toggle from './Toggle'
import Pagination from './Pagination'

export interface Column {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => ReactNode
}

interface CrudPageProps {
  title: string
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
  onDelete?: (row: Record<string, unknown>) => void
  onToggleActive?: (row: Record<string, unknown>, val: boolean) => void
  showActive?: boolean
  addLabel?: string
  filterBar?: ReactNode
}

export default function CrudPage({
  title, backHref, columns, rows, allRowsCount, isLoading, search, onSearchChange,
  page, totalPages, onPage, onAdd, onEdit, onDelete, onToggleActive, showActive = true, addLabel = '+ Add', filterBar,
}: CrudPageProps) {
  return (
    <div>
      {backHref && (
        <a href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 group">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Back to Masters
        </a>
      )}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{c.label}</th>
              ))}
              {showActive && <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>}
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={columns.length + (showActive ? 2 : 1)} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length + (showActive ? 2 : 1)} className="text-center py-12 text-gray-400">No records found.</td></tr>
            ) : rows.map((row, i) => (
              <tr key={String(row.id ?? i)} className="border-t border-gray-50 hover:bg-gray-50">
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
                    {onDelete && (
                      <button
                        onClick={() => { if (confirm('Delete this record?')) onDelete(row) }}
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
