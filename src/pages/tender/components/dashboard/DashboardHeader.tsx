import { memo, type FC } from 'react'
import { ChevronRight, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { MONTH_NAMES } from '../../utils/employeeFormat'
import type { Tone } from './dashboardMetrics'
import { formatHours, formatNumber, formatPercent } from './dashboardFormat'
import { LiveClock } from './LiveClock'
import type { MetricKind } from './metricPeople'
import type { StatsMode } from './StatCards'
import type { IMonthStats, ITodaySummary } from './todayMetrics'

export interface ISubdivisionOption {
  name: string
  count: number
}

interface IDashboardHeaderProps {
  year: number
  month: number
  // Сводка «сегодня»; null — не текущий месяц
  today: ITodaySummary | null
  monthStats: IMonthStats
  presenceLoading: boolean
  refreshing: boolean
  onRefresh: () => void
  subdivisions: ISubdivisionOption[]
  totalCount: number
  // null — все подразделения
  selected: string | null
  onSelectSubdivision: (name: string | null) => void
  // Суммы на дашборде скрыты
  hideMoney: boolean
  onToggleHideMoney: () => void
  // Переключатель «Сегодня / Месяц» — только в текущем месяце (когда есть today)
  mode: StatsMode
  onModeChange: (mode: StatsMode) => void
  // Счётчики открывают мини-окно со списком сотрудников
  onOpenMetric: (kind: MetricKind) => void
}

interface IStatChipProps {
  label: string
  value: string
  tone?: Tone | null
  onClick?: () => void
}

const MODES: Array<{ key: StatsMode; label: string }> = [
  { key: 'today', label: 'Сегодня' },
  { key: 'month', label: 'Месяц' }
]

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

const formatToday = (): string => {
  const text = DATE_FORMATTER.format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const StatChip: FC<IStatChipProps> = ({ label, value, tone, onClick }) => {
  const className = `dash-stat-chip${tone ? ` is-${tone}` : ''}`
  const content = (
    <>
      <span className="dash-stat-chip-label">{label}</span>
      <span className="dash-stat-chip-value">{value}</span>
    </>
  )

  if (!onClick) return <span className={className}>{content}</span>

  return (
    <button
      type="button"
      className={`${className} is-clickable`}
      onClick={onClick}
      aria-label={`${label}: ${value} — показать сотрудников`}
    >
      {content}
      <ChevronRight size={12} strokeWidth={1.75} className="dash-stat-chip-arrow" aria-hidden="true" />
    </button>
  )
}

// Компактная шапка: дата, часы, «Прямой эфир», счётчики и выбор подразделения
const DashboardHeaderBase: FC<IDashboardHeaderProps> = ({
  year,
  month,
  today,
  monthStats,
  presenceLoading,
  refreshing,
  onRefresh,
  subdivisions,
  totalCount,
  selected,
  onSelectSubdivision,
  hideMoney,
  onToggleHideMoney,
  mode,
  onModeChange,
  onOpenMetric
}) => {
  const pending = presenceLoading ? '…' : null

  return (
    <div className="dash-header">
      <div className="dash-header-left">
        <div className="dash-header-time">
          <div className="dash-date">
            {today ? formatToday() : `${MONTH_NAMES[month - 1]} ${year}`}
          </div>
          {today && <LiveClock />}
        </div>

        {today && (
          <span className="dash-live-badge">
            <span className="dash-live-dot" aria-hidden="true" />
            Прямой эфир
          </span>
        )}

        <div className="dash-stat-chips">
          {today ? (
            <>
              <StatChip
                label="На месте"
                value={pending ?? `${today.present}/${today.accounted}`}
                tone={presenceLoading ? null : 'ok'}
                onClick={presenceLoading ? undefined : () => onOpenMetric('today:present')}
              />
              <StatChip
                label="Опоздали"
                value={pending ?? String(today.late)}
                tone={today.late > 0 ? 'warn' : null}
                onClick={presenceLoading ? undefined : () => onOpenMetric('today:late')}
              />
              <StatChip
                label="Нет отметки"
                value={pending ?? String(today.noMark)}
                tone={today.noMark > 0 ? 'bad' : null}
                onClick={presenceLoading ? undefined : () => onOpenMetric('today:nomark')}
              />
              <StatChip label="Входов" value={pending ?? String(today.entries)} />
              <StatChip label="Выходов" value={pending ?? String(today.exits)} />
            </>
          ) : (
            <>
              <StatChip
                label="Явка"
                value={monthStats.attendancePercent === null ? '—' : formatPercent(monthStats.attendancePercent)}
                tone={monthStats.attendanceTone}
                onClick={() => onOpenMetric('attendance')}
              />
              <StatChip
                label="Пропуски"
                value={`${formatNumber(monthStats.missedDays)} дн`}
                tone={monthStats.missedDays > 0 ? 'warn' : null}
                onClick={() => onOpenMetric('missed')}
              />
              <StatChip
                label="Переработки"
                value={`${formatHours(monthStats.overtime)} ч`}
                tone={monthStats.overtimeTone}
                onClick={() => onOpenMetric('overtime')}
              />
              <StatChip
                label="Не заполнен табель"
                value={`${formatNumber(monthStats.unfilledEmployees)} сотр.`}
                tone={monthStats.unfilledEmployees > 0 ? 'warn' : null}
                onClick={() => onOpenMetric('unfilled')}
              />
            </>
          )}

          {today && (
            <button
              type="button"
              className="dash-refresh-btn"
              onClick={onRefresh}
              disabled={refreshing || presenceLoading}
              aria-label="Обновить проходы"
              title="Обновить проходы"
            >
              <span className="dash-refresh-face">
                <RefreshCw size={14} strokeWidth={1.75} className={refreshing ? 'dash-refresh-spin' : undefined} />
              </span>
            </button>
          )}

          <button
            type="button"
            className={`dash-refresh-btn${hideMoney ? ' active' : ''}`}
            onClick={onToggleHideMoney}
            aria-pressed={hideMoney}
            aria-label={hideMoney ? 'Показать суммы' : 'Скрыть суммы'}
            title={hideMoney ? 'Показать суммы' : 'Скрыть суммы'}
          >
            <span className="dash-refresh-face">
              {hideMoney ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </span>
          </button>

          {today && (
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
        </div>
      </div>

      <select
        className="dash-field dash-subdivision-select"
        value={selected ?? ''}
        onChange={event => onSelectSubdivision(event.target.value || null)}
        aria-label="Подразделение"
      >
        <option value="">Все подразделения ({totalCount})</option>
        {subdivisions.map(item => (
          <option key={item.name} value={item.name}>{item.name} ({item.count})</option>
        ))}
      </select>
    </div>
  )
}

export const DashboardHeader = memo(DashboardHeaderBase)
