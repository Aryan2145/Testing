import Link from 'next/link'

const cards = [
  { label: 'States', href: '/app/masters/location/states', desc: 'Manage state records' },
  { label: 'Districts', href: '/app/masters/location/districts', desc: 'Manage district records' },
  { label: 'Talukas', href: '/app/masters/location/talukas', desc: 'Manage taluka records' },
  { label: 'Villages', href: '/app/masters/location/villages', desc: 'Manage village records' },
]

export default function MastersPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Masters</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {cards.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition group"
          >
            <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition">{card.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
