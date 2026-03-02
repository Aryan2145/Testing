interface State {
  id: number
  name: string
}

interface DistrictFormProps {
  name: string
  stateId: string
  states: State[]
  onNameChange: (name: string) => void
  onStateChange: (stateId: string) => void
}

export default function DistrictForm({ name, stateId, states, onNameChange, onStateChange }: DistrictFormProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
        <select
          value={stateId}
          onChange={e => onStateChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select state…</option>
          {states.map(s => (
            <option key={s.id} value={String(s.id)}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">District Name</label>
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Enter district name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </>
  )
}
