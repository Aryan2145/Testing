'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'

const PAGE_SIZE = 15

export function useCrud<T extends Record<string, unknown>>(apiPath: string, queryParams?: Record<string, string>) {
  const [allRows, setAllRows] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { toast } = useToast()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ ...(q ? { q } : {}), ...queryParams })
      const res = await fetch(`${apiPath}?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setAllRows(Array.isArray(data) ? data : [])
      setPage(1)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setIsLoading(false)
    }
  }, [apiPath, JSON.stringify(queryParams)])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchRows(search), 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [search, fetchRows])

  async function create(body: Record<string, unknown>): Promise<T | null> {
    const res = await fetch(apiPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { toast(data.error ?? 'Create failed', 'error'); return null }
    toast('Created successfully')
    await fetchRows(search)
    return data as T
  }

  async function update(id: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`${apiPath}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { toast(data.error ?? 'Update failed', 'error'); return false }
    toast('Updated successfully')
    await fetchRows(search)
    return true
  }

  async function remove(id: string): Promise<string | null> {
    const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      const msg: string = data.error ?? 'Delete failed'
      toast(msg, 'error')
      return msg
    }
    toast('Deleted successfully')
    await fetchRows(search)
    return null
  }

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
  const rows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return { rows, allRows, isLoading, search, setSearch, page, setPage, totalPages, create, update, remove, refetch: () => fetchRows(search) }
}
