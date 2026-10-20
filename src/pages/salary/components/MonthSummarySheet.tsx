import { BottomSheet } from '../../../components/ui/BottomSheet'
import { MONTHS } from '../../../lib/constants'
import { formatRub } from '../../../components/charts/chartUtils'
import type { Payment } from '../types'
import type { IMonthRow } from './MonthsTable'
import { MonthSummaryAccruals } from './MonthSummaryAccruals'
import { MonthSummaryPayments } from './MonthSummaryPayments'
import { MonthSummarySettings } from './MonthSummarySettings'
import '../MonthSummary.css'

interface IMonthSummarySheetProps {
  year: number
  row: IMonthRow
  payments: Payment[]
  onClose: () => void
  onAddPayment: (amount: number, note: string, date: string) => Promise<boolean>
  onDeletePayment: (id: string) => Promise<boolean>
  onSaveSettings: (patch: { bonus?: number; transport_base_cost?: number }) => Promise<boolean>
}

// Остаток: долг, переплата или «всё выплачено»; у будущего месяца — приглушённо
const renderBalance = (row: IMonthRow) => {
  const rounded = Math.round(row.balance)
  if (rounded > 0) {
    return <span className={`ms-hero-value ${row.isFuture ? 'muted' : 'debt'}`}>{formatRub(rounded)}</span>
  }
  if (rounded < 0) {
    return (
      <>
        <span className={`ms-hero-value ${row.isFuture ? 'muted' : 'over'}`}>{formatRub(-rounded)}</span>
        <span className={`ms-hero-hint ${row.isFuture ? 'muted' : 'over'}`}>Переплата</span>
      </>
    )
  }
  return <span className="ms-hero-text muted">Всё выплачено</span>
}

export const MonthSummarySheet = ({
  year,
  row,
  payments,
  onClose,
  onAddPayment,
  onDeletePayment,
  onSaveSettings
}: IMonthSummarySheetProps) => {
  const { stats } = row
  const progress = row.earned > 0 ? Math.min(Math.max(row.paid / row.earned, 0), 1) : 0

  return (
    <BottomSheet title={`${MONTHS[row.monthIndex]} ${year}`} onClose={onClose} variant="modal">
      <div className="ms-root">
        <section className="ms-card" aria-label="Итоги месяца">
          <div className="ms-hero">
            <div className="ms-hero-item">
              <span className="ms-hero-label">Начислено</span>
              <span className="ms-hero-value">{formatRub(row.earned)}</span>
            </div>
            <div className="ms-hero-item">
              <span className="ms-hero-label">Выплачено</span>
              <span className="ms-hero-value">{formatRub(row.paid)}</span>
            </div>
            <div className="ms-hero-item">
              <span className="ms-hero-label">{row.isFuture ? 'Остаток · прогноз' : 'Остаток'}</span>
              {renderBalance(row)}
            </div>
          </div>

          <div
            className="ms-progress"
            role="progressbar"
            aria-label="Выплачено от начисленного"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className="ms-bar-fill ms-progress-fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="ms-progress-caption">Выплачено {Math.round(progress * 100)} %</p>

          <p className="ms-source">
            {row.source === 'tender'
              ? 'Оклад, дни и проезд — из табеля тендерного управления'
              : 'Данные из календаря'}
          </p>
        </section>

        <section className="ms-card" aria-label="Дни">
          <h3 className="ms-card-title">Дни</h3>
          <div className="ms-days">
            <div className="ms-day">
              <span className="ms-day-label"><span className="ms-dot work" />Рабочие</span>
              <span className="ms-day-value">{stats.work}</span>
            </div>
            <div className="ms-day">
              <span className="ms-day-label"><span className="ms-dot worked" />Выходные с работой</span>
              <span className="ms-day-value">{stats.worked}</span>
            </div>
            <div className="ms-day">
              <span className="ms-day-label"><span className="ms-dot vacation" />Отпуск</span>
              <span className="ms-day-value">{stats.vacation}</span>
            </div>
            <div className="ms-day">
              <span className="ms-day-label">Норма</span>
              <span className="ms-day-value">{row.norm}</span>
            </div>
          </div>
          {row.forecastDays > 0 && <p className="ms-note">Из них по плану: {row.forecastDays} дн.</p>}
        </section>

        <MonthSummaryAccruals row={row} />

        <MonthSummaryPayments
          row={row}
          payments={payments}
          onAddPayment={onAddPayment}
          onDeletePayment={onDeletePayment}
        />

        <MonthSummarySettings row={row} onSaveSettings={onSaveSettings} />
      </div>
    </BottomSheet>
  )
}
