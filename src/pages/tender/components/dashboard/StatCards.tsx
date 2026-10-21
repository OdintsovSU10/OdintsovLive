import { memo, type FC } from 'react'
import { formatHours, formatNumber, formatPercent } from './dashboardFormat'
import type { Tone } from './dashboardMetrics'
import type { IMonthStats, ITodaySummary } from './todayMetrics'

export type StatsMode = 'today' | 'month'

interface IStatCardsProps {
  mode: StatsMode
  today: ITodaySummary | null
  monthStats: IMonthStats
  presenceLoading: boolean
}

interface IMiniCardProps {
  label: string
  value: string
  sub?: string
  tone?: Tone | null
}

const MiniCard: FC<IMiniCardProps> = ({ label, value, sub, tone }) => (
  <div className={`dash-mini${tone ? ` is-${tone}` : ''}`}>
    <div className="dash-mini-label">{label}</div>
    <div className="dash-mini-value">
      {value}
      {sub && <span className="dash-mini-sub">{sub}</span>}
    </div>
  </div>
)

// Четыре мини-карточки за выбранный период
const StatCardsBase: FC<IStatCardsProps> = ({ mode, today, monthStats, presenceLoading }) => {
  const pending = presenceLoading ? '…' : null

  return (
    <div className="dash-stat-cards">
      <div className="dash-minis">
        {today && mode === 'today' ? (
          <>
            <MiniCard
              label="Присутствуют"
              value={pending ?? String(today.present)}
              sub={pending ? undefined : `/${today.accounted}`}
              tone="ok"
            />
            <MiniCard label="Отсутствуют" value={pending ?? String(today.absent)} tone={today.absent > 0 ? 'bad' : null} />
            <MiniCard label="Вышли" value={pending ?? String(today.left)} />
            <MiniCard label="Опоздания" value={pending ?? String(today.late)} tone={today.late > 0 ? 'warn' : null} />
          </>
        ) : (
          <>
            <MiniCard
              label="Явка"
              value={monthStats.attendancePercent === null ? '—' : formatPercent(monthStats.attendancePercent)}
              tone={monthStats.attendanceTone}
            />
            <MiniCard
              label="Пропуски"
              value={formatNumber(monthStats.missedDays)}
              sub="дн"
              tone={monthStats.missedDays > 0 ? 'warn' : null}
            />
            <MiniCard label="Переработки" value={formatHours(monthStats.overtime)} sub="ч" tone={monthStats.overtimeTone} />
            <MiniCard
              label="Не заполнен табель"
              value={formatNumber(monthStats.unfilledEmployees)}
              sub="сотр."
              tone={monthStats.unfilledEmployees > 0 ? 'warn' : null}
            />
          </>
        )}
      </div>
    </div>
  )
}

export const StatCards = memo(StatCardsBase)
