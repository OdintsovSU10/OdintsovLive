import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { parseNumber } from '../../lib/formatUtils'
import './PaymentsSection.css'

export type AmountKey = 'rent' | 'water' | 'electricity'

export interface PaymentRow {
  key: AmountKey
  label: string
  amount: number
  manual: boolean
  hasAuto: boolean
}

interface PaymentsSectionProps {
  rows: PaymentRow[]
  onManualChange: (key: AmountKey, value: number) => void
  onReset: (key: AmountKey) => void
}

const formatAmount = (value: number) => (value > 0 ? Math.round(value).toLocaleString('ru-RU') : '')

// Сумма считается автоматически, пока её не ввели вручную; пустое поле или ↺ возвращают авторасчёт
export default function PaymentsSection({ rows, onManualChange, onReset }: PaymentsSectionProps) {
  const [editing, setEditing] = useState<Partial<Record<AmountKey, string>>>({})

  const handleBlur = (row: PaymentRow) => {
    const text = editing[row.key]
    if (text === undefined) return
    setEditing(prev => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })

    if (text.trim() === '') {
      if (row.manual) onReset(row.key)
      return
    }
    const value = parseNumber(text)
    // в поле сумма без копеек: тот же рубль не считаем ручным вводом
    if (row.manual ? value !== row.amount : Math.round(value) !== Math.round(row.amount)) {
      onManualChange(row.key, value)
    }
  }

  return (
    <>
      {rows.map(row => (
        <div key={row.key} className="input-row">
          <span>{row.label}</span>
          <div className="inline-input">
            <input
              type="text"
              inputMode="numeric"
              value={editing[row.key] ?? formatAmount(row.amount)}
              placeholder="0"
              onChange={e => setEditing(prev => ({ ...prev, [row.key]: e.target.value }))}
              onBlur={() => handleBlur(row)}
            />
            <span>₽</span>
            {row.manual ? (
              <button
                className="amount-mode is-manual"
                onClick={() => onReset(row.key)}
                title="Вернуть автоматический расчёт"
              >
                <RotateCcw size={14} />
                <span>вручную</span>
              </button>
            ) : (
              <span className="amount-mode">{row.hasAuto ? 'авто' : ''}</span>
            )}
          </div>
        </div>
      ))}
    </>
  )
}
