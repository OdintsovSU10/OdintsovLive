import { memo, type FC } from 'react'
import { formatHours, formatNumber, formatPercent } from './dashboardFormat'
import type { Tone } from './dashboardMetrics'
import type { MetricKind } from './metricPeople'
import type { IMonthStats, ITodaySummary } from './todayMetrics'

export type StatsMode = 'today' | 'month'

interface IStatCardsProps {
  mode: StatsMode
  today: ITodaySummary | null
  monthStats: IMonthStats
  presenceLoading: boolean
  // Плитка открывает мини-окно со списком сотрудников
  onOpenMetric: (kind: MetricKind) => void
}

interface IMiniCardProps {
  label: string
  value: string
  sub?: string
  tone?: Tone | null
  kind: MetricKind
  // Пока данных нет (проходы грузятся), плитка не нажимается
  disabled?: boolean
  onOpenMetric: (kind: MetricKind) => void
}

const MiniCard: FC<IMiniCardProps> = ({ label, value, sub, tone, kind, disabled = false, onOpenMetric }) => (
  <button
    type="button"
    className={`dash-mini is-clickable${tone ? ` is-${tone}` : ''}`}
    title={label}
    disabled={disabled}
    onClick={() => onOpenMetric(kind)}
    aria-label={`${label}: ${value}${sub ?? ''} — показать сотрудников`}
  >
    <span className="dash-mini-label">{label}</span>
    <span className="dash-mini-value">
      {value}
      {sub && <span className="dash-mini-sub">{sub}</span>}
    </span>
  </button>
)

// Четыре мини-карточки за выбранный период
const StatCardsBase: FC<IStatCardsProps> = ({ mode, today, monthStats, presenceLoading, onOpenMetric }) => {
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
              kind="today:present"
              disabled={presenceLoading}
              onOpenMetric={onOpenMetric}
            />
            <MiniCard
              label="Отсутствуют"
              value={pending ?? String(today.absent)}
              tone={today.absent > 0 ? 'bad' : null}
              kind="today:absent"
              disabled={presenceLoading}
              onOpenMetric={onOpenMetric}
            />
            <MiniCard
              label="Вышли"
              value={pending ?? String(today.left)}
              kind="today:left"
              disabled={presenceLoading}
              onOpenMetric={onOpenMetric}
            />
            <MiniCard
              label="Опоздания"
              value={pending ?? String(today.late)}
              tone={today.late > 0 ? 'warn' : null}
              kind="today:late"
              disabled={presenceLoading}
              onOpenMetric={onOpenMetric}
            />
          </>
        ) : (
          <>
            <MiniCard
              label="Явка"
              value={monthStats.attendancePercent === null ? '—' : formatPercent(monthStats.attendancePercent)}
              tone={monthStats.attendanceTone}
              kind="attendance"
              onOpenMetric={onOpenMetric}
            />
            <MiniCard
              label="Пропуски"
              value={formatNumber(monthStats.missedDays)}
              sub="дн"
              tone={monthStats.missedDays > 0 ? 'warn' : null}
              kind="missed"
              onOpenMetric={onOpenMetric}
            />
            <MiniCard
              label="Переработки"
              value={formatHours(monthStats.overtime)}
              sub="ч"
              tone={monthStats.overtimeTone}
              kind="overtime"
              onOpenMetric={onOpenMetric}
            />
            <MiniCard
              label="Не заполнен табель"
              value={formatNumber(monthStats.unfilledEmployees)}
              sub="сотр."
              tone={monthStats.unfilledEmployees > 0 ? 'warn' : null}
              kind="unfilled"
              onOpenMetric={onOpenMetric}
            />
          </>
        )}
      </div>
    </div>
  )
}

export const StatCards = memo(StatCardsBase)
