import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MONTHS } from '../../../lib/constants'
import { parseNumber } from '../../../lib/formatUtils'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import type { SegmentOption } from '../../../components/ui/SegmentedControl'
import { formatRub } from '../../../components/charts/chartUtils'
import type { IMonthRow } from './MonthsTable'

// Подпись типа сохраняется в note — теми же словами, что и в Telegram-боте
type PaymentKind = 'Зарплата' | 'Аванс' | 'Премия' | 'Отпускные'

const KIND_OPTIONS: SegmentOption<PaymentKind>[] = [
  { value: 'Зарплата', label: 'Зарплата' },
  { value: 'Аванс', label: 'Аванс' },
  { value: 'Премия', label: 'Премия' },
  { value: 'Отпускные', label: 'Отпускные' }
]

const STATUS_VISIBLE_MS = 2000

type SaveStatus = 'idle' | 'ok' | 'error'

// Локальная дата YYYY-MM-DD (без сдвига UTC)
const todayLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Месяц по умолчанию: последний прошедший с долгом, иначе текущий, иначе последний (или январь будущего года)
const getDefaultMonth = (rows: IMonthRow[]): number => {
  const withDebt = [...rows].reverse().find(row => !row.isFuture && !row.isCurrent && Math.round(row.balance) > 0)
  if (withDebt) return withDebt.monthIndex
  const current = rows.find(row => row.isCurrent)
  if (current) return current.monthIndex
  return rows.every(row => row.isFuture) ? 0 : 11
}

interface IQuickPaymentProps {
  year: number
  rows: IMonthRow[]
  onAddPayment: (monthIndex: number, amount: number, note: string, date: string) => Promise<boolean>
}

export const QuickPayment = ({ year, rows, onAddPayment }: IQuickPaymentProps) => {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal)
  const [kind, setKind] = useState<PaymentKind>('Зарплата')
  // Выбор пользователя привязан к году: при смене года снова действует умолчание
  const [picked, setPicked] = useState<{ year: number; month: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const month = picked && picked.year === year ? picked.month : getDefaultMonth(rows)
  const balance = rows[month]?.balance ?? 0
  const roundedBalance = Math.round(balance)
  const parsedAmount = parseNumber(amount)

  const showStatus = (next: SaveStatus) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setStatus(next)
    timerRef.current = window.setTimeout(() => setStatus('idle'), STATUS_VISIBLE_MS)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || parsedAmount <= 0) return

    setSaving(true)
    const ok = await onAddPayment(month, parsedAmount, kind, date || todayLocal())
    setSaving(false)

    if (ok) setAmount('')
    showStatus(ok ? 'ok' : 'error')
  }

  return (
    <form className="sd-quick" onSubmit={handleSubmit}>
      <div className="sd-quick-fields">
        <label className="sd-field sd-field-amount">
          <span className="sd-field-label">Сумма</span>
          <ClearableInput
            className="sd-input"
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onClear={() => setAmount('')}
            clearLabel="Очистить сумму"
          />
        </label>

        <label className="sd-field">
          <span className="sd-field-label">Месяц</span>
          <select
            className="sd-input"
            value={month}
            onChange={e => setPicked({ year, month: Number(e.target.value) })}
          >
            {MONTHS.map((name, i) => <option key={name} value={i}>{name}</option>)}
          </select>
        </label>

        <label className="sd-field">
          <span className="sd-field-label">Дата</span>
          <input
            type="date"
            className="sd-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>

        <div className="sd-field sd-field-kind">
          <span className="sd-field-label">Тип</span>
          <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} ariaLabel="Тип выплаты" size="sm" stretch />
        </div>

        <button type="submit" className="sd-submit" disabled={saving || parsedAmount <= 0}>
          Внести
        </button>
      </div>

      <div className="sd-quick-foot">
        {roundedBalance > 0 && (
          <button type="button" className="sd-chip" onClick={() => setAmount(String(roundedBalance))}>
            Закрыть остаток {formatRub(roundedBalance)}
          </button>
        )}
        <span className={`sd-quick-status ${status}`} aria-live="polite">
          {status === 'ok' && 'Внесено'}
          {status === 'error' && 'Не удалось сохранить'}
        </span>
      </div>
    </form>
  )
}
