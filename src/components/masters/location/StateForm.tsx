interface StateFormProps {
  name: string
  onChange: (name: string) => void
}

export default function StateForm({ name, onChange }: StateFormProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">State Name</label>
      <input
        type="text"
        value={name}
        onChange={e => onChange(e.target.value)}
        placeholder="Enter state name"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
