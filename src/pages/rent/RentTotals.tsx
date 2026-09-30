import { RotateCcw } from 'lucide-react'
import type { AmountKey } from './PaymentsSection'
import './RentTotals.css'

export interface TotalRow {
  key: AmountKey
  label: string
  amount: number
  note: string | null
  manual: boolean
  hasValue: boolean
}

interface RentTotalsProps {
  rows: TotalRow[]
  total: number
  onReset: (key: AmountKey) => void
}

const formatRub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`

// «К оплате» — только чтение; ручные суммы правятся в свёрнутом блоке ниже
export default function RentTotals({ rows, total, onReset }: RentTotalsProps) {
  return (
    <div className="content-section">
      <div className="section-title">К оплате</div>
      {rows.map(row => (
        <div key={row.key} className="totals-row">
          <span className="totals-label">
            {row.label}
            {(row.manual || row.note) && (
              <span className={`totals-note ${row.manual ? 'is-manual' : ''}`}>{row.manual ? 'вручную' : row.note}</span>
            )}
          </span>
          {row.manual && (
            <button
              className="totals-reset"
              onClick={() => onReset(row.key)}
              title="Вернуть автоматический расчёт"
              aria-label="Вернуть автоматический расчёт"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <span className="totals-amount">{row.hasValue ? formatRub(row.amount) : '—'}</span>
        </div>
      ))}
      <div className="totals-row is-total">
        <span className="totals-label">Итого</span>
        <span className="totals-amount">{formatRub(total)}</span>
      </div>
    </div>
  )
}
