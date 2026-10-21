import { memo, type FC } from 'react'
import { formatHours, formatNumber, formatPercent } from './dashboardFormat'
import type { Tone } from './dashboardMetrics'
import type { IMonthStats, ITodaySummary } from './todayMetrics'

export type StatsMode = 'today' | 'month'

interface IStatCardsProps {
  // Переключатель «Сегодня / Месяц» только в текущем месяце
  canToggle: boolean
  mode: StatsMode
  onModeChange: (mode: StatsMode) => void
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

const MODES: Array<{ key: StatsMode; label: string }> = [
  { key: 'today', label: 'Сегодня' },
  { key: 'month', label: 'Месяц' }
]

// Переключатель периода и четыре мини-карточки
const StatCardsBase: FC<IStatCardsProps> = ({ canToggle, mode, onModeChange, today, monthStats, presenceLoading }) => {
  const pending = presenceLoading ? '…' : null

  return (
    <div className="dash-stat-cards">
      {canToggle && (
        <div className="dash-toggle" role="group" aria-label="Период">
          {MODES.map(item => (
            <button
              key={item.key}
              type="button"
              className="dash-toggle-btn"
              aria-pressed={mode === item.key}
              onClick={() => onModeChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

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
