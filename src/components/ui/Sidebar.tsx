'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const locationLinks = [
  { href: '/app/masters/location/states', label: 'States' },
  { href: '/app/masters/location/districts', label: 'Districts' },
  { href: '/app/masters/location/talukas', label: 'Talukas' },
  { href: '/app/masters/location/villages', label: 'Villages' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [mastersOpen, setMastersOpen] = useState(pathname.startsWith('/app/masters'))

  const isActive = (href: string) => pathname === href

  return (
    <aside className="w-56 shrink-0 bg-gray-900 text-gray-100 flex flex-col min-h-screen">
      <div className="px-5 py-4 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight">RGB Admin</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        <Link
          href="/app/dashboard"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive('/app/dashboard') ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
          }`}
        >
          Dashboard
        </Link>

        {/* Masters section */}
        <div>
          <button
            onClick={() => setMastersOpen(o => !o)}
            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
              pathname.startsWith('/app/masters') ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 text-gray-300'
            }`}
          >
            <span>Masters</span>
            <span className="text-xs">{mastersOpen ? '▲' : '▼'}</span>
          </button>

          {mastersOpen && (
            <div className="mt-1 ml-3 space-y-1">
              <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</p>
              {locationLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive(link.href) ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>
    </aside>
  )
}
