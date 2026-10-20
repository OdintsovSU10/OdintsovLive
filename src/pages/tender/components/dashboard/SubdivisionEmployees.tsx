import { memo, useMemo, type FC } from 'react'
import type { EmployeeWithStats } from '../../types'
import type { IEmployeeTrend } from './dashboardTypes'
import { formatHours, formatNumber, formatRub } from './dashboardFormat'
import { getAccrued } from './dashboardMetrics'

interface ISubdivisionEmployeesProps {
  name: string
  trends: IEmployeeTrend[]
  isLive: boolean
  // Доля месяца (округлена снаружи, чтобы список не перерисовывался каждую секунду)
  progress: number
  onSelectEmployee: (employee: EmployeeWithStats) => void
}

interface ISparklineProps {
  data: number[]
  width?: number
  height?: number
}

const Sparkline: FC<ISparklineProps> = ({ data, width = 110, height = 32 }) => {
  if (data.length < 2) {
    return <span className="dash-sparkline-empty">—</span>
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - 4) + 2
    const y = height - ((value - min) / range) * (height - 6) - 3
    return { x, y }
  })
  const last = points[points.length - 1]

  return (
    <svg width={width} height={height} className="dash-sparkline" aria-hidden="true" focusable="false">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map(point => `${point.x},${point.y}`).join(' ')}
      />
      <circle cx={last.x} cy={last.y} r="2.8" fill="currentColor" />
    </svg>
  )
}

// Сотрудники выбранного подразделения: начислено, часы к норме и динамика по месяцам окна
const SubdivisionEmployeesBase: FC<ISubdivisionEmployeesProps> = ({
  name,
  trends,
  isLive,
  progress,
  onSelectEmployee
}) => {
  const sorted = useMemo(() => {
    const live = { isLive, progress }
    return trends
      .map(trend => ({ trend, accrued: getAccrued(trend, live) }))
      .sort((left, right) => right.accrued - left.accrued)
  }, [isLive, progress, trends])

  return (
    <section className="dash-card">
      <h3 className="dash-card-title">Сотрудники: {name}</h3>

      <div className="dash-emp-list">
        {sorted.map(({ trend, accrued }) => {
          const { employee, latest } = trend
          const exceeded = latest.hours > latest.normHoursWeekdays

          return (
            <button
              key={employee.id}
              type="button"
              className="dash-emp-row"
              onClick={() => onSelectEmployee(employee)}
            >
              <span className="dash-avatar">{employee.avatar}</span>
              <span className="dash-emp-info">
                <span className="dash-emp-name">{employee.full_name}</span>
                <span className="dash-emp-meta">{employee.position}</span>
              </span>
              <span className="dash-emp-metric">
                <span className="dash-emp-main">{formatRub(accrued)}</span>
                <span className={`dash-emp-sub${exceeded ? ' alert' : ''}`}>
                  {formatNumber(latest.hours)} / {formatNumber(latest.normHoursWeekdays)} ч
                  {latest.overtime > 0 && ` · +${formatHours(latest.overtime)} ч`}
                </span>
              </span>
              <span className="dash-emp-trend" aria-label="Динамика начислений по месяцам">
                <Sparkline data={trend.points.map(point => point.earned)} />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export const SubdivisionEmployees = memo(SubdivisionEmployeesBase)
