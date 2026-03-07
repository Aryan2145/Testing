'use client'

import { useState, useRef, useCallback } from 'react'

type Tab = 'locations' | 'products'

type LocRow = { State?: string; District?: string; Taluka?: string; Village?: string; [k: string]: string | undefined }
type ProdRow = { Category?: string; 'Sub-Category'?: string; 'Product Name'?: string; Price?: string; SKU?: string; [k: string]: string | undefined }

type ImportResult = {
  created: Record<string, number>
  existing: Record<string, number>
  skipped: { row: number; reason: string }[]
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function MastersImportPage() {
  const [tab, setTab] = useState<Tab>('locations')
  const [locRows, setLocRows] = useState<LocRow[]>([])
  const [prodRows, setProdRows] = useState<ProdRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = tab === 'locations' ? locRows : prodRows
  const hasRows = rows.length > 0

  // ── Template download ─────────────────────────────────────────────────────
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const locWs = XLSX.utils.aoa_to_sheet([
      ['State', 'District', 'Taluka', 'Village'],
      ['Maharashtra', 'Pune', 'Haveli', 'Hadapsar'],
      ['Maharashtra', 'Pune', 'Haveli', 'Kharadi'],
      ['Maharashtra', 'Nagpur', '', ''],
      ['Karnataka', '', '', ''],
    ])
    locWs['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, locWs, 'Locations')

    const prodWs = XLSX.utils.aoa_to_sheet([
      ['Category', 'Sub-Category', 'Product Name', 'Price', 'SKU'],
      ['Electronics', 'Smartphones', 'iPhone 15', '79999', 'IPH15'],
      ['Electronics', 'Smartphones', 'Samsung S24', '69999', 'SS24'],
      ['Electronics', '', '', '', ''],
      ['Apparel', 'Shirts', 'Cotton Shirt', '599', 'SH001'],
    ])
    prodWs['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 10 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, prodWs, 'Products')

    XLSX.writeFile(wb, 'masters-import-template.xlsx')
  }

  // ── File parsing ──────────────────────────────────────────────────────────
  const parseFile = useCallback(async (file: File) => {
    setParseError('')
    setResult(null)

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setParseError('Please upload an .xlsx file. Use the template provided.')
      return
    }

    try {
      const buf = await file.arrayBuffer()
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'array' })

      const sheetName = tab === 'locations' ? 'Locations' : 'Products'
      const sheet = wb.Sheets[sheetName]
      if (!sheet) {
        setParseError(`Sheet "${sheetName}" not found. Please use the provided template.`)
        return
      }

      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as LocRow[] | ProdRow[]
      if (parsed.length === 0) {
        setParseError('The sheet is empty. Add data rows below the header.')
        return
      }

      if (tab === 'locations') setLocRows(parsed as LocRow[])
      else setProdRows(parsed as ProdRow[])
    } catch {
      setParseError('Could not read the file. Make sure it is a valid .xlsx file.')
    }
  }, [tab])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!hasRows) return
    setImporting(true)
    setResult(null)

    const endpoint = tab === 'locations'
      ? '/api/masters/import/locations'
      : '/api/masters/import/products'

    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await r.json()
      setResult(data)
    } catch {
      setResult({ created: {}, existing: {}, skipped: [], error: 'Network error — please try again.' })
    } finally {
      setImporting(false)
    }
  }

  const clearFile = () => {
    if (tab === 'locations') setLocRows([])
    else setProdRows([])
    setResult(null)
    setParseError('')
  }

  // ── Column headers per tab ────────────────────────────────────────────────
  const locCols = ['State', 'District', 'Taluka', 'Village']
  const prodCols = ['Category', 'Sub-Category', 'Product Name', 'Price', 'SKU']
  const cols = tab === 'locations' ? locCols : prodCols
  const preview = rows.slice(0, 20)

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import Master Data</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Bulk-create hierarchical masters from a single Excel file
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['locations', 'products'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setResult(null); setParseError('') }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'locations' ? 'Locations' : 'Products'}
          </button>
        ))}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800">
        {tab === 'locations' ? (
          <>
            <strong>Location hierarchy:</strong> State → District → Taluka → Village.
            Leave columns empty to create only up to that level. Download the template to see the expected format.
          </>
        ) : (
          <>
            <strong>Product hierarchy:</strong> Category → Sub-Category → Product.
            Leave Sub-Category or Product Name empty to create only higher levels. Price and SKU are optional.
          </>
        )}
      </div>

      {/* Upload zone */}
      {!hasRows && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Drop your .xlsx file here or <span className="text-blue-600">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Must use the provided template format</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {parseError}
        </div>
      )}

      {/* Preview table */}
      {hasRows && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">{rows.length}</span> rows parsed
              {rows.length > 20 && <span className="text-gray-400"> — showing first 20</span>}
            </p>
            <button onClick={clearFile} className="text-sm text-gray-500 hover:text-red-500 transition-colors">
              × Clear file
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                    {cols.map(c => (
                      <th key={c} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 text-xs">{i + 2}</td>
                      {cols.map(c => (
                        <td key={c} className="px-3 py-2 text-gray-700 truncate max-w-[200px]">
                          {(row as Record<string, string>)[c] || <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          {!result && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {importing ? 'Importing...' : `Import ${rows.length} rows`}
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-3">
          {result.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {result.error}
            </div>
          )}

          {!result.error && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm font-semibold text-green-800 mb-2">Import complete</p>
              <div className="space-y-1">
                {Object.entries(result.created).map(([key, count]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="text-green-600">✓</span>
                    <span className="capitalize text-gray-700 font-medium w-32">{key}:</span>
                    <span className="text-green-700 font-semibold">{count} created</span>
                    {result.existing[key] > 0 && (
                      <span className="text-gray-400">({result.existing[key]} already existed)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.skipped && result.skipped.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                {result.skipped.length} row{result.skipped.length !== 1 ? 's' : ''} skipped
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {result.skipped.map((s, i) => (
                  <div key={i} className="text-sm text-amber-700">
                    Row {s.row}: {s.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={clearFile}
            className="w-full py-2 border border-gray-300 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}
