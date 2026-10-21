import type { FC } from 'react'
import type { EmployeeWithStats, TimesheetEntry } from '../types'
import { EMPTY_TIMESHEET_STATS, getCellVisual } from '../utils/timesheetCells'
import type { ITimesheetEmployeeStats } from '../utils/timesheetCells'

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
  // День позже сегодняшнего: не открывается
  future: boolean
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
  onToggleSection: (key: string) => void
  onDayClick: (employee: EmployeeWithStats, date: string) => void
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
  onToggleSection,
  onDayClick
}) => {
  const renderCard = (emp: EmployeeWithStats) => {
    const timesheetMap = timesheetByEmployee.get(emp.id) || new Map<number, TimesheetEntry>()
    const stats = employeeStats.get(emp.id) || EMPTY_TIMESHEET_STATS
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
          {days.map(({ day, date, iso, dowName, weekend, future }) => {
            const entry = timesheetMap.get(day)
            const visual = getCellVisual(entry, date)
            const hint = visual?.title || 'Нет записи'

            return (
              <button
                key={`${emp.id}-${day}`}
                type="button"
                className={`ts-mobile-day-cell ${weekend ? 'is-weekend' : ''} ${visual?.className ?? 'ts-day-empty'}`}
                disabled={future}
                onClick={() => onDayClick(emp, iso)}
                title={hint}
                aria-label={`${dowName}, ${day}: ${hint}`}
              >
                <span className="ts-mobile-day-label">
                  <span>{dowName}</span>
                  <span>{day}</span>
                </span>
                <span className="ts-mobile-day-value">{visual ? visual.label : '·'}</span>
                {entry?.is_correction && <span className="ts-correction-dot" />}
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
