import { useState } from 'react'
import { parseNumber } from '../../lib/formatUtils'
import type { ElectricityTariffs, WaterTariffs } from './rentUtils'
import './TariffsSection.css'

interface TariffsSectionProps {
  water: WaterTariffs
  electricity: ElectricityTariffs
  meterNames: string[]
  onWaterChange: (key: keyof WaterTariffs, value: number) => void
  onElectricityChange: (name: string, value: number) => void
}

interface TariffRow {
  id: string
  label: string
  unit: string
  value: number
  save: (value: number) => void
}

const WATER_ROWS: { key: keyof WaterTariffs; label: string }[] = [
  { key: 'cold', label: 'ХВС' },
  { key: 'hot', label: 'ГВС' },
  { key: 'drainage', label: 'Водоотведение' }
]

const formatTariff = (value: number) => (value > 0 ? String(value).replace('.', ',') : '')

export default function TariffsSection({
  water,
  electricity,
  meterNames,
  onWaterChange,
  onElectricityChange
}: TariffsSectionProps) {
  const [editing, setEditing] = useState<Record<string, string>>({})

  const rows: TariffRow[] = [
    ...WATER_ROWS.map(({ key, label }) => ({
      id: `water-${key}`,
      label,
      unit: '₽/м³',
      value: water[key],
      save: (value: number) => onWaterChange(key, value)
    })),
    ...meterNames.map(name => ({
      id: `electricity-${name}`,
      label: `Электричество ${name}`,
      unit: '₽/кВт·ч',
      value: electricity[name] || 0,
      save: (value: number) => onElectricityChange(name, value)
    }))
  ]

  const handleBlur = (row: TariffRow) => {
    const text = editing[row.id]
    if (text === undefined) return
    setEditing(prev => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    const value = parseNumber(text)
    if (value !== row.value) row.save(value)
  }

  return (
    <div className="content-section">
      <div className="section-title">Тарифы</div>
      {rows.map(row => (
        <div key={row.id} className="input-row">
          <span>{row.label}</span>
          <div className="inline-input">
            <input
              type="text"
              inputMode="decimal"
              value={editing[row.id] ?? formatTariff(row.value)}
              placeholder="0"
              onChange={e => setEditing(prev => ({ ...prev, [row.id]: e.target.value }))}
              onBlur={() => handleBlur(row)}
            />
            <span className="tariff-unit">{row.unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
