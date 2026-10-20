import type { CSSProperties, FC } from 'react'
import type { LivePayrollSnapshot } from '../../utils/livePayroll'
import {
  formatHours,
  formatMillions,
  formatPercent,
  formatShortMoney,
  formatSignedHours,
  getPercentOf
} from './dashboardFormat'
import { countAbsentNow, countOnSite, type PresenceCounts, type IScopeSummary } from './dashboardMetrics'

interface IDashboardPulseProps {
  isCurrentMonth: boolean
  summary: IScopeSummary
  live: LivePayrollSnapshot
  // Статусы «сегодня» (только для текущего месяца)
  presence: PresenceCounts
  accountedCount: number
  presenceLoading: boolean
}

interface IPulseTileProps {
  label: string
  value: string
  sub?: string
  progress?: number
}

const PulseTile: FC<IPulseTileProps> = ({ label, value, sub, progress }) => (
  <div className="dash-pulse-tile">
    <span className="dash-pulse-label">{label}</span>
    <span className="dash-pulse-value">{value}</span>
    {progress !== undefined && (
      <span className="dash-pulse-bar" aria-hidden="true">
        <span className="dash-pulse-bar-fill" style={{ '--progress': Math.min(1, Math.max(0, progress)) } as CSSProperties} />
      </span>
    )}
    {sub && <span className="dash-pulse-sub">{sub}</span>}
  </div>
)

// Тонкая строка «Пульс»: четыре ключевых значения по выбранной области
export const DashboardPulse: FC<IDashboardPulseProps> = ({
  isCurrentMonth,
  summary,
  live,
  presence,
  accountedCount,
  presenceLoading
}) => {
  const fact = live.isLive ? live.accrued : summary.accrued
  const plan = live.isLive ? live.planned : summary.plan
  const payrollValue = plan >= 1_000_000
    ? `${formatMillions(fact)} / ${formatMillions(plan)} млн`
    : `${formatShortMoney(fact)} / ${formatShortMoney(plan)}`

  const overtimeDiff = summary.overtime - summary.previousOvertime

  return (
    <div className="dash-pulse">
      {isCurrentMonth ? (
        <PulseTile
          label="На месте"
          value={presenceLoading ? '…' : `${countOnSite(presence)}/${accountedCount}`}
        />
      ) : (
        <PulseTile
          label="Явка"
          value={summary.normDays > 0 ? formatPercent(getPercentOf(summary.workedDays, summary.normDays)) : '—'}
        />
      )}

      <PulseTile
        label="ФОТ"
        value={payrollValue}
        progress={plan > 0 ? fact / plan : 0}
        sub={plan > 0 ? formatPercent(getPercentOf(fact, plan)) : undefined}
      />

      <PulseTile
        label="Переработки"
        value={`${formatHours(summary.overtime)} ч`}
        sub={`${formatSignedHours(overtimeDiff)} ч к прошлому месяцу`}
      />

      {isCurrentMonth ? (
        <PulseTile
          label="Отсутствуют"
          value={presenceLoading ? '…' : String(countAbsentNow(presence))}
        />
      ) : (
        <PulseTile label="Пропуски, дн" value={String(summary.missedDays)} />
      )}
    </div>
  )
}
