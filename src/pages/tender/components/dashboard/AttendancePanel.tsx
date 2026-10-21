import { useMemo, type CSSProperties, type FC } from 'react'
import type { IEmployeeTrend, StatusCounts } from './dashboardTypes'
import { formatNumber } from './dashboardFormat'
import { ATTENDANCE_STATUS_ROWS, getStatusDays, type MetricKind } from './metricPeople'

interface IAttendancePanelProps {
  statusCounts: StatusCounts
  trends: IEmployeeTrend[]
  onOpenMetric: (kind: MetricKind) => void
}

// Посещаемость за прошедший месяц: человеко-дни по статусам табеля
export const AttendancePanel: FC<IAttendancePanelProps> = ({ statusCounts, trends, onOpenMetric }) => {
  const rows = useMemo(() => ATTENDANCE_STATUS_ROWS.map(row => ({
    ...row,
    value: getStatusDays(statusCounts, row.key),
    people: trends.filter(trend => getStatusDays(trend.latest.statusCounts, row.key) > 0).length
  })), [statusCounts, trends])
  const withTimesheet = useMemo(() => trends.filter(trend => trend.latest.hasTimesheet).length, [trends])
  const max = Math.max(...rows.map(row => row.value), 1)

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">Посещаемость за месяц</h3>
      <p className="dash-hbars-note">человеко-дни по табелю · {formatNumber(withTimesheet)} сотрудников</p>
      <div className="dash-hbars">
        {rows.map(row => {
          const content = (
            <>
              <span className="dash-hbar-label">{row.label}</span>
              <span className="dash-hbar-track" aria-hidden="true">
                <span
                  className={`dash-hbar-fill tone-${row.key}`}
                  style={{ '--value': row.value / max } as CSSProperties}
                />
              </span>
              <span className="dash-hbar-value">
                {row.value > 0 ? (
                  <>
                    {formatNumber(row.value)} дн
                    <span className="dash-hbar-people"> · {formatNumber(row.people)} чел.</span>
                  </>
                ) : '—'}
              </span>
            </>
          )

          if (row.value <= 0) return <div key={row.key} className="dash-hbar-row">{content}</div>

          return (
            <button
              key={row.key}
              type="button"
              className="dash-hbar-row is-clickable"
              onClick={() => onOpenMetric(`status:${row.key}`)}
              aria-label={`${row.label}: ${formatNumber(row.value)} дн, ${formatNumber(row.people)} чел. — показать сотрудников`}
            >
              {content}
            </button>
          )
        })}
      </div>
    </section>
  )
}
