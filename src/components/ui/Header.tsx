'use client'

import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      <button
        onClick={handleLogout}
        className="text-sm text-gray-500 hover:text-red-600 transition font-medium"
      >
        Logout
      </button>
    </header>
  )
}
