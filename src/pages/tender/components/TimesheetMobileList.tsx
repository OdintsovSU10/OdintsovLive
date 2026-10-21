import type { FC } from 'react'
import type { EmployeeWithStats, TimesheetEntry } from '../types'

export interface ITimesheetCellVisual {
  label: string
  className: string
  title: string
  underworkTag?: string
}

export interface ITimesheetEmployeeStats {
  workDays: number
  remoteDays: number
  vacationDays: number
  weekendDays: number
  totalHours: number
  overtimeHours: number
}

// Секция списка: подразделение (title) или единый плоский список (title = null)
export interface ITimesheetSection {
  key: string
  title: string | null
  employees: EmployeeWithStats[]
}

export interface ITimesheetMobileDay {
  day: number
  date: Date
  iso: string
  dowName: string
  weekend: boolean
}

export interface ITimesheetMobileListProps {
  sections: ITimesheetSection[]
  days: ITimesheetMobileDay[]
  collapsed: Record<string, boolean>
  employeeColors: Map<number, string>
  timesheetByEmployee: Map<number, Map<number, TimesheetEntry>>
  employeeStats: Map<number, ITimesheetEmployeeStats>
  monthNormDays: number
  monthNormHours: number
  getCellVisual: (entry: TimesheetEntry | undefined, date: Date) => ITimesheetCellVisual | null
  onToggleSection: (key: string) => void
  onCellClick?: (employeeId: number, date: string) => void
}

const EMPTY_STATS: ITimesheetEmployeeStats = {
  workDays: 0,
  remoteDays: 0,
  vacationDays: 0,
  weekendDays: 0,
  totalHours: 0,
  overtimeHours: 0
}

const DEFAULT_COLOR = 'var(--text-secondary)'

export const TimesheetMobileList: FC<ITimesheetMobileListProps> = ({
  sections,
  days,
  collapsed,
  employeeColors,
  timesheetByEmployee,
  employeeStats,
  monthNormDays,
  monthNormHours,
  getCellVisual,
  onToggleSection,
  onCellClick
}) => {
  const renderCard = (emp: EmployeeWithStats) => {
    const timesheetMap = timesheetByEmployee.get(emp.id) || new Map<number, TimesheetEntry>()
    const stats = employeeStats.get(emp.id) || EMPTY_STATS
    const color = employeeColors.get(emp.id) || DEFAULT_COLOR
    const totalWorkedDays = stats.workDays + stats.weekendDays
    const isDaysOverNorm = totalWorkedDays > monthNormDays
    const isHoursOverNorm = stats.totalHours > monthNormHours

    return (
      <article key={emp.id} className="ts-mobile-card">
        <div className="ts-mobile-card-head">
          <span
            className="ts-avatar"
            style={{
              color,
              borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
              background: `color-mix(in srgb, ${color} 10%, transparent)`
            }}
          >
            {emp.avatar}
          </span>
          <span className="ts-mobile-card-name" title={emp.position || undefined}>{emp.full_name}</span>
          <span className="ts-mobile-card-hours">
            <span className={`ts-mobile-fact ${isHoursOverNorm ? 'over' : ''}`}>{stats.totalHours}</span>
            /{monthNormHours} ч
          </span>
        </div>

        <div className="ts-mobile-kpis">
          <div className="ts-mobile-kpi">
            <span>Дни (ф/н)</span>
            <strong>
              <span className={`ts-mobile-fact ${isDaysOverNorm ? 'over' : ''}`}>{totalWorkedDays}</span>
              <span className="ts-mobile-divider">/</span>
              <span className="ts-mobile-norm">{monthNormDays}</span>
            </strong>
          </div>
          <div className="ts-mobile-kpi weekend">
            <span>Вых. дни</span>
            <strong>{stats.weekendDays}</strong>
          </div>
          <div className={`ts-mobile-kpi overtime ${stats.overtimeHours > 0 ? 'over' : ''}`}>
            <span>Перераб.</span>
            <strong>{stats.overtimeHours > 0 ? `+${stats.overtimeHours.toLocaleString('ru-RU')}` : '0'}</strong>
          </div>
        </div>

        <div className="ts-mobile-week-strip">
          {days.map(({ day, date, iso, dowName, weekend }) => {
            const entry = timesheetMap.get(day)
            const visual = getCellVisual(entry, date)

            return (
              <button
                key={`${emp.id}-${day}`}
                type="button"
                className={`ts-mobile-day-cell ${weekend ? 'is-weekend' : ''}`}
                onClick={() => onCellClick?.(emp.id, iso)}
                title={visual?.title || ''}
              >
                <span className="ts-mobile-day-label">
                  <span>{dowName}</span>
                  <span>{day}</span>
                </span>
                {visual ? (
                  <span className={visual.className} title={visual.title} aria-label={visual.title}>
                    {visual.underworkTag && <span className="ts-underwork-tag">{visual.underworkTag}</span>}
                    {visual.label}
                    {entry?.is_correction && <span className="ts-correction-dot" />}
                  </span>
                ) : (
                  <span className="ts-cell-empty">—</span>
                )}
              </button>
            )
          })}
        </div>
      </article>
    )
  }

  return (
    <div className="ts-mobile-groups">
      {sections.map(section => (
        <section key={section.key} className="ts-mobile-group">
          {section.title !== null && (
            <button
              type="button"
              className="ts-mobile-group-header"
              onClick={() => onToggleSection(section.key)}
            >
              <span className={`ts-group-toggle ${collapsed[section.key] ? 'is-collapsed' : ''}`}>▼</span>
              <span className="ts-group-mark" style={{ background: employeeColors.get(section.employees[0]?.id) || DEFAULT_COLOR }} />
              <span className="ts-group-title">{section.title}</span>
              <span className="ts-group-count">({section.employees.length})</span>
            </button>
          )}

          {(section.title === null || !collapsed[section.key]) && (
            <div className="ts-mobile-cards">
              {section.employees.map(renderCard)}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
