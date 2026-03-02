import Toggle from '@/components/ui/Toggle'

export interface Column {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => React.ReactNode
}

interface EntityTableProps {
  title: string
  columns: Column[]
  rows: Record<string, unknown>[]
  onEdit: (row: Record<string, unknown>) => void
  onToggle: (row: Record<string, unknown>, value: boolean) => void
  searchValue: string
  onSearchChange: (val: string) => void
  onAddClick: () => void
  isLoading: boolean
}

export default function EntityTable({
  title,
  columns,
  rows,
  onEdit,
  onToggle,
  searchValue,
  onSearchChange,
  onAddClick,
  isLoading,
}: EntityTableProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        <button
          onClick={onAddClick}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          + Add
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="Search…"
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="text-left px-4 py-3 font-medium text-gray-600">
                  {col.label}
                </th>
              ))}
              <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + 2} className="text-center py-8 text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="text-center py-8 text-gray-400">
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={String(row.id ?? i)} className="border-t border-gray-100 hover:bg-gray-50">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <Toggle
                      checked={Boolean(row.is_active)}
                      onChange={v => onToggle(row, v)}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onEdit(row)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
