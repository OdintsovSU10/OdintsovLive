import { useState } from 'react'
import type { FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { parseNumber } from '../../../lib/formatUtils'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import type { SegmentOption } from '../../../components/ui/SegmentedControl'
import { formatRub } from '../../../components/charts/chartUtils'
import type { Payment } from '../types'
import type { IMonthRow } from './MonthsTable'

// Подпись типа сохраняется в note — теми же словами, что и в Telegram-боте
type PaymentKind = 'Зарплата' | 'Аванс' | 'Премия' | 'Отпускные'

const KIND_OPTIONS: SegmentOption<PaymentKind>[] = [
  { value: 'Зарплата', label: 'Зарплата' },
  { value: 'Аванс', label: 'Аванс' },
  { value: 'Премия', label: 'Премия' },
  { value: 'Отпускные', label: 'Отпускные' }
]

// Локальная дата YYYY-MM-DD (без сдвига UTC)
const todayLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// YYYY-MM-DD → dd.mm без Date: нет сдвига часового пояса
const formatPaymentDate = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`

interface IMonthSummaryPaymentsProps {
  row: IMonthRow
  payments: Payment[]
  onAddPayment: (amount: number, note: string, date: string) => Promise<boolean>
  onDeletePayment: (id: string) => Promise<boolean>
}

export const MonthSummaryPayments = ({ row, payments, onAddPayment, onDeletePayment }: IMonthSummaryPaymentsProps) => {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal)
  const [kind, setKind] = useState<PaymentKind>('Зарплата')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const roundedBalance = Math.round(row.balance)
  const parsedAmount = parseNumber(amount)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || parsedAmount <= 0) return

    setSaving(true)
    const ok = await onAddPayment(parsedAmount, kind, date || todayLocal())
    setSaving(false)

    if (ok) setAmount('')
    setError(ok ? '' : 'Не удалось сохранить выплату')
  }

  const handleDelete = async (payment: Payment) => {
    if (!window.confirm(`Удалить выплату ${formatRub(payment.amount)}?`)) return
    setDeletingId(payment.id)
    const ok = await onDeletePayment(payment.id)
    setDeletingId(null)
    setError(ok ? '' : 'Не удалось удалить выплату')
  }

  return (
    <section className="ms-card" aria-label="Выплаты">
      <h3 className="ms-card-title">Выплаты</h3>

      {payments.length === 0 ? (
        <p className="ms-note">Выплат пока нет</p>
      ) : (
        <ul className="ms-payments">
          {payments.map(payment => (
            <li key={payment.id} className="ms-payment">
              <span className="ms-payment-date">{formatPaymentDate(payment.date)}</span>
              <span className="ms-payment-amount">{formatRub(payment.amount)}</span>
              <span className="ms-payment-note">{payment.note}</span>
              <button
                type="button"
                className="ms-icon-btn"
                aria-label="Удалить выплату"
                disabled={deletingId === payment.id}
                onClick={() => handleDelete(payment)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="ms-add" onSubmit={handleSubmit}>
        <div className="ms-add-row">
          <label className="sd-field ms-add-amount">
            <span className="sd-field-label">Сумма</span>
            <ClearableInput
              className="sd-input sd-input-num"
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onClear={() => setAmount('')}
              clearLabel="Очистить сумму"
            />
          </label>
          <label className="sd-field ms-add-date">
            <span className="sd-field-label">Дата</span>
            <input type="date" className="sd-input" value={date} onChange={e => setDate(e.target.value)} />
          </label>
        </div>

        <div className="sd-field ms-add-kind">
          <span className="sd-field-label">Тип</span>
          <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} ariaLabel="Тип выплаты" size="sm" stretch />
        </div>

        <div className="ms-add-foot">
          {roundedBalance > 0 && (
            <button type="button" className="sd-chip" onClick={() => setAmount(String(roundedBalance))}>
              Закрыть остаток {formatRub(roundedBalance)}
            </button>
          )}
          <button type="submit" className="sd-submit ms-add-submit" disabled={saving || parsedAmount <= 0}>
            Внести
          </button>
        </div>

        {error && <p className="ms-error" role="alert">{error}</p>}
      </form>
    </section>
  )
}
