import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { parseNumber } from '../../lib/formatUtils'
import type { ElectricityMeter } from './rentUtils'

interface ElectricitySectionProps {
  meters: ElectricityMeter[]
  prevMeters: ElectricityMeter[] | null
  onChange: (meters: ElectricityMeter[]) => void
}

const toInputs = (meters: ElectricityMeter[]): Record<string, string> =>
  Object.fromEntries(meters.map(m => [m.name, m.value > 0 ? String(m.value) : '']))

export default function ElectricitySection({ meters, prevMeters, onChange }: ElectricitySectionProps) {
  const [inputs, setInputs] = useState(() => toInputs(meters))
  const [newMeterName, setNewMeterName] = useState('')

  useEffect(() => {
    setInputs(toInputs(meters))
  }, [meters])

  const addMeter = () => {
    if (!newMeterName.trim()) return
    onChange([...meters, { name: newMeterName.trim(), value: 0 }])
    setNewMeterName('')
  }

  const handleBlur = (index: number, name: string) => {
    const value = parseNumber(inputs[name] || '0')
    onChange(meters.map((m, i) => (i === index ? { ...m, value } : m)))
  }

  const removeMeter = (index: number) => {
    onChange(meters.filter((_, i) => i !== index))
  }

  const getUsage = (meterName: string, currentValue: number) => {
    const prevMeter = prevMeters?.find(m => m.name === meterName)
    if (!prevMeter) return null
    return Math.max(0, currentValue - prevMeter.value)
  }

  const getTotalUsage = () => {
    if (!prevMeters || prevMeters.length === 0) return null
    let total = 0
    let hasAnyMatch = false
    for (const meter of meters) {
      const usage = getUsage(meter.name, meter.value)
      if (usage !== null) {
        total += usage
        hasAnyMatch = true
      }
    }
    return hasAnyMatch ? total : null
  }

  const totalUsage = getTotalUsage()

  return (
    <div className="content-section">
      <div className="section-header">
        <div className="section-title">Электричество</div>
        {totalUsage !== null && (
          <span className="total-usage">всего: {totalUsage.toFixed(2)} кВт</span>
        )}
      </div>
      {meters.map((meter, index) => {
        const usage = getUsage(meter.name, meter.value)
        return (
          <div key={meter.name} className="input-row electricity-row">
            <span>{meter.name}</span>
            <div className="meter-input">
              <input
                type="text"
                inputMode="decimal"
                value={inputs[meter.name] ?? (meter.value > 0 ? String(meter.value) : '')}
                placeholder="0"
                onChange={e => setInputs(prev => ({ ...prev, [meter.name]: e.target.value }))}
                onBlur={() => handleBlur(index, meter.name)}
              />
              {usage !== null && (
                <span className="usage">расход: {usage.toFixed(2)} кВт</span>
              )}
              <button className="delete-btn" onClick={() => removeMeter(index)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )
      })}
      <div className="add-meter">
        <input
          type="text"
          placeholder="Название счётчика"
          value={newMeterName}
          onChange={e => setNewMeterName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addMeter()}
        />
        <button onClick={addMeter} disabled={!newMeterName.trim()}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}
