interface Taluka {
  id: number
  name: string
}

interface VillageFormProps {
  name: string
  talukaId: string
  talukas: Taluka[]
  onNameChange: (name: string) => void
  onTalukaChange: (talukaId: string) => void
}

export default function VillageForm({ name, talukaId, talukas, onNameChange, onTalukaChange }: VillageFormProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Taluka</label>
        <select
          value={talukaId}
          onChange={e => onTalukaChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select taluka…</option>
          {talukas.map(t => (
            <option key={t.id} value={String(t.id)}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Village Name</label>
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Enter village name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </>
  )
}
