import { useMemo, type CSSProperties, type FC } from 'react'
import type { IEmployeeTrend } from './dashboardTypes'
import { formatHours, formatNumber, pluralize } from './dashboardFormat'
import { ATTENDANCE_STATUS_ROWS, getStatusDays, type MetricKind } from './metricPeople'

interface IAttendancePanelProps {
  trends: IEmployeeTrend[]
  onOpenMetric: (kind: MetricKind) => void
}

const formatDays = (value: number): string => `${formatHours(Math.round(value * 10) / 10)} дн`

// Посещаемость за прошедший месяц: сколько человек были в каждом статусе табеля и сколько дней
export const AttendancePanel: FC<IAttendancePanelProps> = ({ trends, onOpenMetric }) => {
  const staff = useMemo(() => trends.filter(trend => trend.latest.hasTimesheet), [trends])
  const total = staff.length
  const normDays = staff[0]?.latest.normWorkdays ?? 0

  const rows = useMemo(() => ATTENDANCE_STATUS_ROWS.map(row => {
    const days = staff.map(trend => getStatusDays(trend.latest.statusCounts, row.key)).filter(value => value > 0)
    const sum = days.reduce((acc, value) => acc + value, 0)
    return { ...row, people: days.length, days: sum, average: days.length > 0 ? sum / days.length : 0 }
  }), [staff])

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">Посещаемость за месяц</h3>
      <p className="dash-hbars-note">
        Сколько человек были в статусе по табелю
        {total > 0 && ` · всего ${formatNumber(total)} ${pluralize(total, 'сотрудник', 'сотрудника', 'сотрудников')}`}
        {normDays > 0 && `, норма ${formatNumber(normDays)} раб. ${pluralize(normDays, 'день', 'дня', 'дней')}`}
      </p>
      <div className="dash-hbars">
        {rows.map(row => {
          const content = (
            <>
              <span className="dash-hbar-label">{row.label}</span>
              <span className="dash-hbar-value">
                {row.people > 0 ? `${formatNumber(row.people)} из ${formatNumber(total)} чел.` : 'никого'}
              </span>
              <span className="dash-hbar-track" aria-hidden="true">
                <span
                  className={`dash-hbar-fill tone-${row.key}`}
                  style={{ '--value': total > 0 ? row.people / total : 0 } as CSSProperties}
                />
              </span>
              {row.people > 0 && (
                <span className="dash-hbar-sub">
                  {row.people > 1 ? `по ${formatDays(row.average)} в среднем · всего ${formatDays(row.days)}` : formatDays(row.days)}
                </span>
              )}
            </>
          )

          if (row.people === 0) return <div key={row.key} className="dash-hbar-row is-empty">{content}</div>

          return (
            <button
              key={row.key}
              type="button"
              className="dash-hbar-row is-clickable"
              onClick={() => onOpenMetric(`status:${row.key}`)}
              aria-label={`${row.label}: ${formatNumber(row.people)} из ${formatNumber(total)} чел., всего ${formatDays(row.days)} — показать сотрудников`}
            >
              {content}
            </button>
          )
        })}
      </div>
    </section>
  )
}
