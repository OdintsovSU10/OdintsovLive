import type { CSSProperties, FC } from 'react'
import type { StatusCounts } from './dashboardTypes'
import { formatNumber } from './dashboardFormat'

interface IAttendancePanelProps {
  statusCounts: StatusCounts
}

interface IAttendanceRow {
  key: string
  label: string
  value: number
}

// Посещаемость за прошедший месяц: дни по статусам табеля
export const AttendancePanel: FC<IAttendancePanelProps> = ({ statusCounts }) => {
  const rows: IAttendanceRow[] = [
    { key: 'work', label: 'Работа', value: statusCounts.work + statusCounts.sick_worked },
    { key: 'remote', label: 'Удалённо', value: statusCounts.remote },
    { key: 'vacation', label: 'Отпуск', value: statusCounts.vacation + statusCounts.educational_leave },
    { key: 'sick', label: 'Больничный', value: statusCounts.sick },
    { key: 'absent', label: 'Прогул', value: statusCounts.absent },
    { key: 'unpaid', label: 'За свой счёт', value: statusCounts.unpaid }
  ]
  const max = Math.max(...rows.map(row => row.value), 1)

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">Посещаемость за месяц</h3>
      <div className="dash-hbars">
        {rows.map(row => (
          <div key={row.key} className="dash-hbar-row">
            <span className="dash-hbar-label">{row.label}</span>
            <span className="dash-hbar-track" aria-hidden="true">
              <span
                className={`dash-hbar-fill tone-${row.key}`}
                style={{ '--value': row.value / max } as CSSProperties}
              />
            </span>
            <span className="dash-hbar-value">{formatNumber(row.value)} дн</span>
          </div>
        ))}
      </div>
    </section>
  )
}
