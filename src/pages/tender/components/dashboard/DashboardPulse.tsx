import type { CSSProperties, FC } from 'react'
import type { LivePayrollSnapshot } from '../../utils/livePayroll'
import {
  formatHours,
  formatPercent,
  formatShortMoney,
  formatSignedHours,
  getPercentOf
} from './dashboardFormat'
import {
  countAbsentNow,
  countOnSite,
  getAttendanceTone,
  getOnSiteTone,
  getOvertimeTone,
  getPayrollTone,
  type PresenceCounts,
  type IScopeSummary,
  type Tone
} from './dashboardMetrics'

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
  // Тон только при отклонении; в норме плитка нейтральная
  tone?: Tone | null
}

const PulseTile: FC<IPulseTileProps> = ({ label, value, sub, progress, tone }) => (
  <div className={`dash-pulse-tile${tone ? ` is-${tone}` : ''}`}>
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
  // Крупно — только начисленное; план и процент — мелко под полосой
  const payrollValue = formatShortMoney(fact)
  const payrollSub = plan > 0 ? `из ${formatShortMoney(plan)} · ${formatPercent(getPercentOf(fact, plan))}` : undefined

  const overtimeDiff = summary.overtime - summary.previousOvertime
  const presenceKnown = !presenceLoading

  return (
    <div className="dash-pulse">
      {isCurrentMonth ? (
        <PulseTile
          label="На месте"
          value={presenceLoading ? '…' : `${countOnSite(presence)}/${accountedCount}`}
          tone={presenceKnown ? getOnSiteTone(presence, accountedCount) : null}
        />
      ) : (
        <PulseTile
          label="Явка"
          value={summary.normDays > 0 ? formatPercent(getPercentOf(summary.workedDays, summary.normDays)) : '—'}
          tone={getAttendanceTone(summary.workedDays, summary.normDays)}
        />
      )}

      <PulseTile
        label="ФОТ"
        value={payrollValue}
        progress={plan > 0 ? fact / plan : 0}
        sub={payrollSub}
        tone={getPayrollTone(fact, plan, live.isLive)}
      />

      <PulseTile
        label="Переработки"
        value={`${formatHours(summary.overtime)} ч`}
        sub={`${formatSignedHours(overtimeDiff)} ч к прошлому месяцу`}
        tone={getOvertimeTone(summary.overtime, summary.previousOvertime)}
      />

      {isCurrentMonth ? (
        <PulseTile
          label="Отсутствуют"
          value={presenceLoading ? '…' : String(countAbsentNow(presence))}
          tone={presenceKnown && presence.noMark > 0 ? 'bad' : null}
        />
      ) : (
        <PulseTile label="Пропуски, дн" value={String(summary.missedDays)} />
      )}
    </div>
  )
}
