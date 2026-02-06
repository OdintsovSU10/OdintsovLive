import { Fragment, useMemo, useState } from 'react'
import type { EmployeeWithStats, TimesheetEntry, TimesheetStatus } from '../types'
import { getDailyHoursNorm, isWeekendOrHoliday } from '../utils/salaryCalculator'
import './TimesheetGrid.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onCellClick?: (employeeId: number, date: string) => void
}

type ViewMode = 'month' | 'week'

interface EmployeeStats {
  workDays: number
  remoteDays: number
  vacationDays: number
  weekendDays: number
  totalHours: number
  overtimeHours: number
}

const DOW_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const DEPT_PALETTE = ['#a78bfa', '#38bdf8', '#6ee7b7', '#fbbf24', '#f472b6', '#fb923c', '#34d399', '#818cf8']

const STATUS_META: Record<TimesheetStatus, { label: string; short: string; className: string }> = {
  work: { label: 'Работа', short: '', className: 'work' },
  remote: { label: 'Удалёнка', short: 'У', className: 'remote' },
  vacation: { label: 'Отпуск', short: 'О', className: 'vacation' },
  dayoff: { label: 'Выходной', short: 'В', className: 'dayoff' },
  absent: { label: 'Отсутствие', short: 'Б', className: 'absent' },
  unpaid: { label: 'За свой счёт', short: 'Н', className: 'unpaid' }
}

const getPositionPriority = (position: string | undefined): number => {
  const p = position?.toLowerCase() || ''
  if (p.includes('руководитель')) return 0
  if (p.includes('старший группы')) return 1
  return 2
}

const getDayDowMonday = (year: number, month: number, day: number): number => {
  const date = new Date(year, month - 1, day)
  return (date.getDay() + 6) % 7
}

const isWeekendDay = (year: number, month: number, day: number): boolean => {
  return isWeekendOrHoliday(new Date(year, month - 1, day))
}

const formatHours = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1))

const formatMonthLabel = (year: number, month: number): string => {
  const raw = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const toIsoDate = (year: number, month: number, day: number): string => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const getHoursToneClass = (hours: number): string => {
  if (hours >= 12) return 'ts-hours-12'
  if (hours >= 10) return 'ts-hours-10'
  if (hours >= 8) return 'ts-hours-8'
  if (hours >= 5) return 'ts-hours-5'
  return 'ts-hours-low'
}

const getWorkedHours = (entry: TimesheetEntry, date: Date): number => {
  if (entry.status !== 'work' && entry.status !== 'remote') return 0
  return entry.hours_worked ?? getDailyHoursNorm(date)
}

const buildWeeks = (year: number, month: number, daysInMonth: number): number[][] => {
  const weeks: number[][] = []
  let week: number[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day)
    if (getDayDowMonday(year, month, day) === 6 || day === daysInMonth) {
      weeks.push(week)
      week = []
    }
  }

  return weeks
}

const buildTimesheetMap = (timesheet: TimesheetEntry[] | undefined, year: number, month: number): Map<number, TimesheetEntry> => {
  const map = new Map<number, TimesheetEntry>()
  if (!timesheet) return map

  for (const entry of timesheet) {
    const date = new Date(`${entry.work_date}T12:00:00`)
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue
    map.set(date.getDate(), entry)
  }

  return map
}

const getEmployeeStats = (timesheetMap: Map<number, TimesheetEntry>, year: number, month: number, days: number[]): EmployeeStats => {
  let workDays = 0
  let remoteDays = 0
  let vacationDays = 0
  let weekendDays = 0
  let totalHours = 0
  let overtimeHours = 0

  for (const day of days) {
    const entry = timesheetMap.get(day)
    if (!entry) continue

    const date = new Date(year, month - 1, day)
    const weekend = isWeekendOrHoliday(date)

    if (entry.status === 'work' || entry.status === 'remote') {
      const hours = getWorkedHours(entry, date)
      workDays += 1
      if (entry.status === 'remote') remoteDays += 1
      if (weekend && hours >= 3) weekendDays += 1
      totalHours += hours
      overtimeHours += Math.max(0, hours - getDailyHoursNorm(date))
      continue
    }

    if (entry.status === 'vacation') {
      vacationDays += 1
    }
  }

  return {
    workDays,
    remoteDays,
    vacationDays,
    weekendDays,
    totalHours: Math.round(totalHours),
    overtimeHours: Math.round(overtimeHours * 10) / 10
  }
}

const getCellVisual = (
  entry: TimesheetEntry | undefined,
  date: Date
): { label: string; className: string; title: string } | null => {
  if (!entry) return null

  if (entry.status === 'work') {
    const hours = getWorkedHours(entry, date)
    return {
      label: formatHours(hours),
      className: `ts-pill ts-pill-hours ${getHoursToneClass(hours)}`,
      title: `Работа (${formatHours(hours)} ч)`
    }
  }

  if (entry.status === 'remote') {
    const hours = getWorkedHours(entry, date)
    return {
      label: STATUS_META.remote.short,
      className: `ts-pill ts-pill-status ts-status-${STATUS_META.remote.className}`,
      title: `${STATUS_META.remote.label} (${formatHours(hours)} ч)`
    }
  }

  const meta = STATUS_META[entry.status]
  return {
    label: meta.short,
    className: `ts-pill ts-pill-status ts-status-${meta.className}`,
    title: meta.label
  }
}

export function TimesheetGrid({ employees, year, month, onCellClick }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({})
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<number | null>(null)

  const daysInMonth = new Date(year, month, 0).getDate()
  const allDays = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const weeks = useMemo(() => buildWeeks(year, month, daysInMonth), [year, month, daysInMonth])
  const activeWeek = weeks.length > 0 ? Math.min(selectedWeek, weeks.length - 1) : 0
  const daysToShow = viewMode === 'month' ? allDays : (weeks[activeWeek] || allDays)
  const compact = viewMode === 'month'
  const monthLabel = useMemo(() => formatMonthLabel(year, month), [year, month])

  const groupedEmployees = useMemo(() => {
    const managers: EmployeeWithStats[] = []
    const groups = new Map<string, EmployeeWithStats[]>()

    employees.forEach(emp => {
      const priority = getPositionPriority(emp.position)
      if (priority === 0) {
        // Руководители - отдельная группа
        managers.push(emp)
      } else {
        const key = emp.subdivision || 'Без подразделения'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(emp)
      }
    })

    groups.forEach(emps => {
      emps.sort((a, b) => {
        const priorityDelta = getPositionPriority(a.position) - getPositionPriority(b.position)
        if (priorityDelta !== 0) return priorityDelta
        return a.full_name.localeCompare(b.full_name)
      })
    })

    const result: [string, EmployeeWithStats[]][] = []

    if (managers.length > 0) {
      managers.sort((a, b) => a.full_name.localeCompare(b.full_name))
      result.push(['Руководители', managers])
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    result.push(...sortedGroups)

    return result
  }, [employees])

  const timesheetByEmployee = useMemo(() => {
    const map = new Map<number, Map<number, TimesheetEntry>>()
    for (const employee of employees) {
      map.set(employee.id, buildTimesheetMap(employee.timesheet, year, month))
    }
    return map
  }, [employees, year, month])

  const employeeStats = useMemo(() => {
    const stats = new Map<number, EmployeeStats>()
    for (const employee of employees) {
      const timesheetMap = timesheetByEmployee.get(employee.id) || new Map<number, TimesheetEntry>()
      stats.set(employee.id, getEmployeeStats(timesheetMap, year, month, allDays))
    }
    return stats
  }, [allDays, employees, month, timesheetByEmployee, year])

  const departmentColors = useMemo(() => {
    const colors = new Map<string, string>()
    groupedEmployees.forEach(([department], index) => {
      colors.set(department, DEPT_PALETTE[index % DEPT_PALETTE.length])
    })
    return colors
  }, [groupedEmployees])

  const departmentStats = useMemo(() => {
    const stats = new Map<string, { totalHours: number; avgOvertime: number }>()

    groupedEmployees.forEach(([department, departmentEmployees]) => {
      const totalHours = departmentEmployees.reduce((sum, employee) => {
        const employeeStat = employeeStats.get(employee.id)
        return sum + (employeeStat?.totalHours ?? 0)
      }, 0)

      const totalOvertime = departmentEmployees.reduce((sum, employee) => {
        const employeeStat = employeeStats.get(employee.id)
        return sum + (employeeStat?.overtimeHours ?? 0)
      }, 0)

      stats.set(department, {
        totalHours,
        avgOvertime: departmentEmployees.length > 0 ? Math.round((totalOvertime / departmentEmployees.length) * 10) / 10 : 0
      })
    })

    return stats
  }, [employeeStats, groupedEmployees])

  const toggleDepartment = (department: string) => {
    setCollapsedDepartments(previous => ({ ...previous, [department]: !previous[department] }))
  }

  return (
    <div className="timesheet-grid">
      <div className="ts-toolbar">
        <div className="ts-title-wrap">
          <h2 className="ts-title">Табель учёта рабочего времени</h2>
          <span className="ts-month-badge">{monthLabel}</span>
        </div>

        <div className="ts-toolbar-controls">
          <div className="ts-view-toggle">
            <button
              type="button"
              className={`ts-view-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              Месяц
            </button>
            <button
              type="button"
              className={`ts-view-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Неделя
            </button>
          </div>

          {viewMode === 'week' && (
            <div className="ts-week-switch">
              {weeks.map((week, index) => (
                <button
                  key={`${week[0]}-${week[week.length - 1]}`}
                  type="button"
                  className={`ts-week-btn ${activeWeek === index ? 'active' : ''}`}
                  onClick={() => setSelectedWeek(index)}
                >
                  {week[0]}–{week[week.length - 1]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="timesheet-legend">
        <span className="ts-legend-title">Легенда</span>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-hours-12" /> 12+ часов</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-hours-10" /> 10–12 часов</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-hours-8" /> 8–10 часов</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-hours-5" /> &lt; 8 часов</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-status-remote" /> Удалёнка</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-status-vacation" /> Отпуск</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-status-absent" /> Отсутствие</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-weekend-dot" /> Выходной</div>
      </div>

      <div className="timesheet-table-wrapper">
        <table className="timesheet-table">
          <thead>
            <tr>
              <th className="ts-name-col">Сотрудник</th>
              {daysToShow.map(day => (
                <th
                  key={day}
                  className={`ts-day-col ${isWeekendDay(year, month, day) ? 'ts-weekend-header' : ''} ${getDayDowMonday(year, month, day) === 6 ? 'ts-day-end' : ''}`}
                >
                  <div className="ts-day-header">
                    <span className="ts-day-num">{day}</span>
                    <span className="ts-day-name">{DOW_NAMES[getDayDowMonday(year, month, day)]}</span>
                  </div>
                </th>
              ))}
              <th className="ts-summary-col">Раб. / Часы</th>
            </tr>
          </thead>
          <tbody>
            {groupedEmployees.map(([subdivision, groupEmps]) => (
              <Fragment key={subdivision}>
                <tr className="ts-group-header-row" onClick={() => toggleDepartment(subdivision)}>
                  <td colSpan={daysToShow.length + 2} className="ts-group-cell">
                    <span className={`ts-group-toggle ${collapsedDepartments[subdivision] ? 'is-collapsed' : ''}`}>▼</span>
                    <span
                      className="ts-group-mark"
                      style={{ background: departmentColors.get(subdivision) || '#94a3b8' }}
                    />
                    <span className="ts-group-title">{subdivision}</span>
                    <span className="ts-group-count">({groupEmps.length})</span>
                    <span className="ts-group-meta">
                      Σ {(departmentStats.get(subdivision)?.totalHours ?? 0).toLocaleString('ru-RU')} ч • ⌀ ОТ {(departmentStats.get(subdivision)?.avgOvertime ?? 0).toLocaleString('ru-RU')} ч
                    </span>
                  </td>
                </tr>
                {!collapsedDepartments[subdivision] && groupEmps.map(emp => {
                  const timesheetMap = timesheetByEmployee.get(emp.id) || new Map<number, TimesheetEntry>()
                  const stats = employeeStats.get(emp.id) || {
                    workDays: 0,
                    remoteDays: 0,
                    vacationDays: 0,
                    weekendDays: 0,
                    totalHours: 0,
                    overtimeHours: 0
                  }

                  const isHighlighted = highlightedEmployeeId === emp.id
                  const summaryClass = stats.totalHours > 200 ? 'high' : stats.totalHours > 160 ? 'mid' : 'ok'

                  return (
                    <tr
                      key={emp.id}
                      className={`ts-employee-row ${isHighlighted ? 'is-highlighted' : ''}`}
                      onMouseEnter={() => setHighlightedEmployeeId(emp.id)}
                      onMouseLeave={() => setHighlightedEmployeeId(null)}
                    >
                      <td className="ts-name-cell">
                        <div className="ts-emp-info">
                          <span
                            className="ts-avatar"
                            style={{
                              color: departmentColors.get(subdivision) || '#94a3b8',
                              borderColor: `${departmentColors.get(subdivision) || '#94a3b8'}40`,
                              background: `${departmentColors.get(subdivision) || '#94a3b8'}1a`
                            }}
                          >
                            {emp.avatar}
                          </span>
                          <span className="ts-emp-text">
                            <span className="ts-emp-name">{emp.full_name}</span>
                            {!compact && <span className="ts-emp-role">{emp.position}</span>}
                          </span>
                        </div>
                      </td>

                      {daysToShow.map(day => {
                        const date = new Date(year, month - 1, day)
                        const entry = timesheetMap.get(day)
                        const visual = getCellVisual(entry, date)
                        const weekend = isWeekendDay(year, month, day)
                        const dateStr = toIsoDate(year, month, day)

                        return (
                          <td
                            key={`${emp.id}-${day}`}
                            className={`ts-cell ${weekend ? 'ts-weekend' : ''} ${getDayDowMonday(year, month, day) === 6 ? 'ts-day-end' : ''}`}
                            onClick={() => onCellClick?.(emp.id, dateStr)}
                            title={visual?.title || ''}
                          >
                            {visual ? (
                              <span className={visual.className}>
                                {visual.label}
                                {entry?.is_correction && <span className="ts-correction-dot" />}
                              </span>
                            ) : (
                              <span className="ts-cell-empty">—</span>
                            )}
                          </td>
                        )
                      })}

                      <td className="ts-summary-cell">
                        <div className="ts-summary-main">{stats.workDays}д</div>
                        <div className={`ts-summary-hours ${summaryClass}`}>{stats.totalHours}</div>
                        {stats.overtimeHours > 0 && (
                          <div className="ts-summary-overtime">+{stats.overtimeHours.toLocaleString('ru-RU')}ч</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
