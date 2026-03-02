interface District {
  id: number
  name: string
}

interface TalukaFormProps {
  name: string
  districtId: string
  districts: District[]
  onNameChange: (name: string) => void
  onDistrictChange: (districtId: string) => void
}

export default function TalukaForm({ name, districtId, districts, onNameChange, onDistrictChange }: TalukaFormProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
        <select
          value={districtId}
          onChange={e => onDistrictChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select district…</option>
          {districts.map(d => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Taluka Name</label>
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Enter taluka name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </>
  )
}
