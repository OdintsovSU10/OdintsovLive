import type { ReactNode } from 'react'
import { MONTHS } from '../../../lib/constants'
import { formatRub } from '../../../components/charts/chartUtils'
import type { MonthStats } from '../types'

export interface IMonthRow {
  monthIndex: number
  stats: MonthStats
  salary: number
  norm: number
  dailyRate: number
  vacationRate: number
  bonus: number
  transport: number
  earned: number
  paid: number
  // earned - paid
  balance: number
  // Дней, посчитанных по плану (будущее), а не по факту
  forecastDays: number
  isCurrent: boolean
  isFuture: boolean
  // Откуда данные месяца: табель тендера или личные настройки
  source: 'tender' | 'personal'
}

interface IMonthsTableProps {
  rows: IMonthRow[]
  onOpen: (monthIndex: number) => void
}

// Остаток: долг, «✓» или переплата
const renderBalance = (balance: number): ReactNode => {
  const rounded = Math.round(balance)
  if (rounded > 0) return <span className="sd-debt">{formatRub(rounded)}</span>
  if (rounded === 0) return <span className="sd-muted">✓</span>
  return (
    <span className="sd-over">
      +{formatRub(-rounded)}<span className="sd-over-label"> переплата</span>
    </span>
  )
}

export const MonthsTable = ({ rows, onOpen }: IMonthsTableProps) => {
  const past = rows.filter(row => !row.isFuture)
  const totalEarned = past.reduce((sum, row) => sum + row.earned, 0)
  const totalPaid = past.reduce((sum, row) => sum + row.paid, 0)
  const totalBalance = past.reduce((sum, row) => sum + row.balance, 0)

  return (
    <section className="sd-table" aria-label="Месяцы">
      <div className="sd-head" aria-hidden="true">
        <span>Месяц</span>
        <span>Дни</span>
        <span className="sd-num">Начислено</span>
        <span className="sd-num">Выплачено</span>
        <span className="sd-num">Остаток</span>
      </div>

      {rows.map(row => {
        const classes = ['sd-row-wrap', row.isCurrent ? 'current' : '', row.isFuture ? 'future' : '']
          .filter(Boolean)
          .join(' ')

        return (
          <div key={row.monthIndex} className={classes}>
            <button
              type="button"
              className="sd-row"
              aria-haspopup="dialog"
              onClick={() => onOpen(row.monthIndex)}
            >
              <span className="sd-month">
                <span className="sd-month-name">{MONTHS[row.monthIndex]}</span>
                {row.isFuture && <span className="sd-badge">прогноз</span>}
                {!row.isFuture && row.forecastDays > 0 && (
                  <span className="sd-badge">план {row.forecastDays} дн.</span>
                )}
              </span>
              <span className="sd-days" title="Рабочие · Выходные · Отпуск">
                Р {row.stats.work} · В {row.stats.worked} · О {row.stats.vacation}
              </span>
              <span className="sd-money">
                <span className="sd-num sd-earned"><span className="sd-mlabel">Нач. </span>{formatRub(row.earned)}</span>
                <span className="sd-num sd-paid"><span className="sd-mlabel">Выпл. </span>{formatRub(row.paid)}</span>
              </span>
              <span className="sd-num sd-balance">{renderBalance(row.balance)}</span>
            </button>
          </div>
        )
      })}

      <div className="sd-row-wrap total">
        <div className="sd-row">
          <span className="sd-month"><span className="sd-month-name">Итого</span></span>
          <span className="sd-days" />
          <span className="sd-money">
            <span className="sd-num sd-earned"><span className="sd-mlabel">Нач. </span>{formatRub(totalEarned)}</span>
            <span className="sd-num sd-paid"><span className="sd-mlabel">Выпл. </span>{formatRub(totalPaid)}</span>
          </span>
          <span className="sd-num sd-balance">{renderBalance(totalBalance)}</span>
        </div>
      </div>
    </section>
  )
}
