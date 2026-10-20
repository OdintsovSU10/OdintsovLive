import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { parseNumber } from '../../../lib/formatUtils'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { formatRub } from '../../../components/charts/chartUtils'
import type { Payment } from '../types'
import type { IMonthRow } from './MonthsTable'

interface IMonthDetailsProps {
  id: string
  row: IMonthRow
  payments: Payment[]
  salarySource: 'tender' | 'personal'
  onSaveSettings: (patch: { bonus?: number; transport_base_cost?: number }) => Promise<boolean>
  onDeletePayment: (id: string) => Promise<boolean>
}

const formatInput = (value: number): string => (value > 0 ? Math.round(value).toLocaleString('ru-RU') : '')

// YYYY-MM-DD → dd.mm без Date: нет сдвига часового пояса
const formatPaymentDate = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`

export const MonthDetails = ({ id, row, payments, salarySource, onSaveSettings, onDeletePayment }: IMonthDetailsProps) => {
  const [bonusInput, setBonusInput] = useState(() => formatInput(row.bonus))
  const [transportInput, setTransportInput] = useState(() => formatInput(row.transport))
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { stats, dailyRate, norm, vacationRate, transport } = row
  const transportRate = transport / norm

  const saveField = async (field: 'bonus' | 'transport_base_cost', raw: string) => {
    const value = Math.max(0, parseNumber(raw))
    const current = field === 'bonus' ? row.bonus : row.transport
    const setInput = field === 'bonus' ? setBonusInput : setTransportInput
    setInput(formatInput(value))
    if (value === current) return

    const ok = await onSaveSettings({ [field]: value })
    setError(ok ? '' : 'Не удалось сохранить')
  }

  const handleDelete = async (payment: Payment) => {
    if (!window.confirm(`Удалить выплату ${formatRub(payment.amount)}?`)) return
    setDeletingId(payment.id)
    const ok = await onDeletePayment(payment.id)
    setDeletingId(null)
    setError(ok ? '' : 'Не удалось удалить выплату')
  }

  return (
    <div id={id} className="sd-details">
      <div className="sd-det-col">
        <h3 className="sd-det-title">Расчёт</h3>
        <dl className="sd-calc">
          <div className="sd-calc-row">
            <dt>Оклад</dt>
            <dd>
              {formatRub(row.salary)}
              {salarySource === 'tender' && <span className="sd-muted"> из тендера</span>}
            </dd>
          </div>
          <div className="sd-calc-row">
            <dt>Норма</dt>
            <dd>{norm} дн.</dd>
          </div>
          <div className="sd-calc-row">
            <dt>Ставка за день</dt>
            <dd>{formatRub(dailyRate)}</dd>
          </div>
          <div className="sd-calc-row">
            <dt>Рабочие {stats.work} × {formatRub(dailyRate)}</dt>
            <dd>{formatRub(dailyRate * stats.work)}</dd>
          </div>
          <div className="sd-calc-row">
            <dt>Выходные {stats.worked} × {formatRub(dailyRate)}</dt>
            <dd>{formatRub(dailyRate * stats.worked)}</dd>
          </div>
          <div className="sd-calc-row">
            <dt>Отпуск {stats.vacation} × {formatRub(vacationRate)}</dt>
            <dd>{formatRub(stats.vacation * vacationRate)}</dd>
          </div>
          <div className="sd-calc-row">
            <dt>Проезд {stats.work} × {formatRub(transportRate)}</dt>
            <dd>{formatRub(transportRate * stats.work)}</dd>
          </div>
          <div className="sd-calc-row">
            <dt>Премия</dt>
            <dd>{formatRub(row.bonus)}</dd>
          </div>
          <div className="sd-calc-row total">
            <dt>Начислено</dt>
            <dd>{formatRub(row.earned)}</dd>
          </div>
        </dl>

        {row.forecastDays > 0 && <p className="sd-det-note">Из них по плану: {row.forecastDays} дн.</p>}

        <div className="sd-det-fields">
          <label className="sd-field">
            <span className="sd-field-label">Премия, ₽</span>
            <ClearableInput
              className="sd-input sd-input-num"
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              value={bonusInput}
              onChange={e => setBonusInput(e.target.value)}
              onBlur={() => saveField('bonus', bonusInput)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onClear={() => setBonusInput('')}
              clearLabel="Очистить премию"
            />
          </label>
          <label className="sd-field">
            <span className="sd-field-label">Проезд за месяц, ₽</span>
            <ClearableInput
              className="sd-input sd-input-num"
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              value={transportInput}
              onChange={e => setTransportInput(e.target.value)}
              onBlur={() => saveField('transport_base_cost', transportInput)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onClear={() => setTransportInput('')}
              clearLabel="Очистить проезд"
            />
          </label>
        </div>
      </div>

      <div className="sd-det-col">
        <h3 className="sd-det-title">Выплаты</h3>
        {payments.length === 0 ? (
          <p className="sd-det-note">Выплат нет</p>
        ) : (
          <ul className="sd-payments">
            {payments.map(payment => (
              <li key={payment.id} className="sd-payment">
                <span className="sd-payment-date">{formatPaymentDate(payment.date)}</span>
                <span className="sd-payment-amount">{formatRub(payment.amount)}</span>
                <span className="sd-payment-note">{payment.note}</span>
                <button
                  type="button"
                  className="sd-icon-btn"
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

        <dl className="sd-calc">
          <div className="sd-calc-row">
            <dt>Выплачено</dt>
            <dd>{formatRub(row.paid)}</dd>
          </div>
          <div className="sd-calc-row total">
            <dt>Остаток</dt>
            <dd className={Math.round(row.balance) > 0 ? 'sd-debt' : Math.round(row.balance) < 0 ? 'sd-over' : ''}>
              {formatRub(row.balance)}
            </dd>
          </div>
        </dl>

        {error && <p className="sd-det-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
