import { Fragment, useEffect, useMemo, useState } from 'react'
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
const formatExactHours = (value: number): string => (
  value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
)

const toIsoDate = (year: number, month: number, day: number): string => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Норма часов в табеле: Пн-Чт = 9, Пт = 8, выходные = 0.
const getTimesheetNormHours = (date: Date): number => {
  const day = date.getDay()
  if (day >= 1 && day <= 4) return 9
  if (day === 5) return 8
  return 0
}

const WEEKEND_TARGET_HOURS = 5

const getWorkedHours = (entry: TimesheetEntry, date: Date): number => {
  if (entry.status !== 'work' && entry.status !== 'remote') return 0

  const expectedHours = getDailyHoursNorm(date)
  const weekendOrHoliday = isWeekendOrHoliday(date)
  const rawHours = entry.hours_worked ?? expectedHours

  // Импорт "У" подставляет 8ч по умолчанию. В будни считаем это полной нормой дня (9/8),
  // чтобы суммарные часы и факт/план не занижались.
  if (
    entry.status === 'remote'
    && !weekendOrHoliday
    && entry.hours_worked === 8
    && !entry.is_correction
  ) {
    return expectedHours
  }

  return rawHours
}

const getMinimumHoursForDay = (date: Date): number => {
  if (isWeekendOrHoliday(date)) return WEEKEND_TARGET_HOURS
  if (date.getDay() === 5) return 8
  return 9
}

const getUnderworkTag = (date: Date): string => {
  if (isWeekendOrHoliday(date)) return '<5ч'
  if (date.getDay() === 5) return '<8ч'
  return '<9ч'
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
      totalHours += hours
      overtimeHours += Math.max(0, hours - getDailyHoursNorm(date))

      if (entry.status === 'remote') {
        remoteDays += 1
      }

      if (weekend) {
        if (entry.status === 'remote' || hours >= 3) weekendDays += 1
      } else {
        if (entry.status === 'remote' || hours >= 3) {
          workDays += 1
        }
      }
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
): { label: string; className: string; title: string; underworkTag?: string } | null => {
  if (!entry) return null

  if (entry.status === 'work' || entry.status === 'remote') {
    const hours = getWorkedHours(entry, date)
    const rawHours = entry.hours_worked ?? getDailyHoursNorm(date)
    const minimumHours = getMinimumHoursForDay(date)
    const isCritical = hours < 3
    const isUnderworked = hours < minimumHours
    const isOverTenHours = hours > 10
    const baseTone = entry.status === 'remote'
      ? 'ts-tone-remote'
      : (isWeekendOrHoliday(date) ? 'ts-tone-weekend' : 'ts-tone-workday')

    let stateTone = 'ts-state-normal'
    if (isCritical) {
      stateTone = 'ts-state-critical'
    } else if (isOverTenHours) {
      stateTone = 'ts-state-high'
    } else if (isUnderworked) {
      stateTone = 'ts-state-low'
    }

    const titlePrefix = entry.status === 'remote' ? STATUS_META.remote.label : STATUS_META.work.label
    const hasAdjustedHours = Math.abs(rawHours - hours) > 0.001
    const title = hasAdjustedHours
      ? `${titlePrefix}. Факт в табеле: ${formatExactHours(rawHours)} ч. Учтено в расчёте: ${formatExactHours(hours)} ч. Норма дня: ${minimumHours} ч.`
      : `${titlePrefix}. Отработано: ${formatExactHours(hours)} ч. Норма дня: ${minimumHours} ч.`

    return {
      label: entry.status === 'remote' ? STATUS_META.remote.short : formatHours(hours),
      className: `ts-pill ${entry.status === 'remote' ? 'ts-pill-status' : 'ts-pill-hours'} ${baseTone} ${stateTone}`,
      title,
      underworkTag: isUnderworked ? getUnderworkTag(date) : undefined
    }
  }

  const meta = STATUS_META[entry.status]
  return {
    label: meta.short,
    className: `ts-pill ts-pill-status ts-status-${meta.className}`,
    title: `${meta.label}. Отработано: 0 ч.`
  }
}

export function TimesheetGrid({ employees, year, month, onCellClick }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({})
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
  ))

  const daysInMonth = new Date(year, month, 0).getDate()
  const allDays = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const monthNormHours = useMemo(() => (
    allDays.reduce((sum, day) => {
      const date = new Date(year, month - 1, day)
      if (isWeekendOrHoliday(date)) return sum
      return sum + getTimesheetNormHours(date)
    }, 0)
  ), [allDays, month, year])
  const monthNormDays = useMemo(() => (
    allDays.reduce((sum, day) => {
      const date = new Date(year, month - 1, day)
      return isWeekendOrHoliday(date) ? sum : sum + 1
    }, 0)
  ), [allDays, month, year])
  const weeks = useMemo(() => buildWeeks(year, month, daysInMonth), [year, month, daysInMonth])
  const resolvedViewMode: ViewMode = isMobile ? 'week' : viewMode
  const activeWeek = weeks.length > 0 ? Math.min(selectedWeek, weeks.length - 1) : 0
  const daysToShow = resolvedViewMode === 'month' ? allDays : (weeks[activeWeek] || allDays)
  const compact = resolvedViewMode === 'month'

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

  const toggleDepartment = (department: string) => {
    setCollapsedDepartments(previous => ({ ...previous, [department]: !previous[department] }))
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const media = window.matchMedia('(max-width: 640px)')
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches)
    }

    setIsMobile(media.matches)

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (!isMobile || weeks.length === 0) return

    const now = new Date()
    const targetDay = now.getFullYear() === year && now.getMonth() + 1 === month
      ? now.getDate()
      : 1

    const weekIndex = weeks.findIndex(week => week.includes(targetDay))
    setSelectedWeek(weekIndex >= 0 ? weekIndex : 0)
  }, [isMobile, month, weeks, year])

  return (
    <div className="timesheet-grid">
      <div className="ts-toolbar">
        <div className="ts-title-wrap">
          <h2 className="ts-title">Табель учёта рабочего времени</h2>
        </div>

        <div className="ts-toolbar-controls">
          {!isMobile && (
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
          )}

          {resolvedViewMode === 'week' && (
            <div className="ts-week-switch">
              {weeks.map((week, index) => (
                <button
                  key={`${week[0]}-${week[week.length - 1]}`}
                  type="button"
                  className={`ts-week-btn ${activeWeek === index ? 'active' : ''}`}
                  onClick={() => setSelectedWeek(index)}
                >
                  {isMobile ? `Нед. ${index + 1}` : `${week[0]}–${week[week.length - 1]}`}
                </button>
              ))}
            </div>
          )}

          {isMobile && resolvedViewMode === 'week' && weeks[activeWeek] && (
            <span className="ts-week-range-hint">
              {weeks[activeWeek][0]}–{weeks[activeWeek][weeks[activeWeek].length - 1]} число
            </span>
          )}
        </div>
      </div>

      <div className="timesheet-legend">
        <span className="ts-legend-title">Легенда</span>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-tone-weekend" /> Выходные дни</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-tone-workday" /> Рабочие дни (будни)</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-tone-remote" /> Удалёнка</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-state-low" /> Недоработка (ярлык &lt;9/&lt;8/&lt;5)</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-state-critical" /> Критично (&lt;3ч)</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-state-high" /> Повышенная нагрузка (&gt;10ч)</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-status-vacation" /> Отпуск</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-status-absent" /> Отсутствие</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-weekend-dot" /> Выходной</div>
      </div>

      {!isMobile && (
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
                <th className="ts-summary-col">Раб. / Часы (ф/н)</th>
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
                    const totalWorkedDays = stats.workDays + stats.weekendDays
                    const isHoursOverNorm = stats.totalHours > monthNormHours
                    const isDaysOverNorm = totalWorkedDays > monthNormDays

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
                                <span className={visual.className} title={visual.title} aria-label={visual.title}>
                                  {visual.underworkTag && <span className="ts-underwork-tag">{visual.underworkTag}</span>}
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
                          <div className="ts-summary-main" title="Всего дней (включая выходные) / норма рабочих дней">
                            <span className={`ts-summary-fact ${isDaysOverNorm ? 'over' : ''}`}>{totalWorkedDays}</span>
                            <span className="ts-summary-divider">/</span>
                            <span className="ts-summary-norm">{monthNormDays}</span>
                            <span className="ts-summary-unit">д</span>
                          </div>
                          <div className="ts-summary-hours" title="Часы факт/норма">
                            <span className={`ts-summary-fact ${isHoursOverNorm ? 'over' : ''}`}>{stats.totalHours}</span>
                            <span className="ts-summary-divider">/</span>
                            <span className="ts-summary-norm">{monthNormHours}</span>
                          </div>
                          {stats.overtimeHours > 0 && (
                            <div className={`ts-summary-overtime ${stats.overtimeHours > 0 ? 'over' : ''}`}>
                              +{stats.overtimeHours.toLocaleString('ru-RU')}ч
                            </div>
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
      )}

      {isMobile && (
        <div className="ts-mobile-groups">
          {groupedEmployees.map(([subdivision, groupEmps]) => (
            <section key={subdivision} className="ts-mobile-group">
              <button
                type="button"
                className="ts-mobile-group-header"
                onClick={() => toggleDepartment(subdivision)}
              >
                <span className={`ts-group-toggle ${collapsedDepartments[subdivision] ? 'is-collapsed' : ''}`}>▼</span>
                <span
                  className="ts-group-mark"
                  style={{ background: departmentColors.get(subdivision) || '#94a3b8' }}
                />
                <span className="ts-group-title">{subdivision}</span>
                <span className="ts-group-count">({groupEmps.length})</span>
              </button>

              {!collapsedDepartments[subdivision] && (
                <div className="ts-mobile-cards">
                  {groupEmps.map(emp => {
                    const timesheetMap = timesheetByEmployee.get(emp.id) || new Map<number, TimesheetEntry>()
                    const stats = employeeStats.get(emp.id) || {
                      workDays: 0,
                      remoteDays: 0,
                      vacationDays: 0,
                      weekendDays: 0,
                      totalHours: 0,
                      overtimeHours: 0
                    }
                    const totalWorkedDays = stats.workDays + stats.weekendDays
                    const isDaysOverNorm = totalWorkedDays > monthNormDays
                    const isHoursOverNorm = stats.totalHours > monthNormHours

                    return (
                      <article key={emp.id} className="ts-mobile-card">
                        <div className="ts-mobile-card-head">
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
                            <span className="ts-emp-role">{emp.position || 'Без должности'}</span>
                          </span>
                        </div>

                        <div className="ts-mobile-kpis">
                          <div className="ts-mobile-kpi">
                            <span>Дни (всего/норма)</span>
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
                          <div className="ts-mobile-kpi">
                            <span>Часы (ф/н)</span>
                            <strong>
                              <span className={`ts-mobile-fact ${isHoursOverNorm ? 'over' : ''}`}>{stats.totalHours}</span>
                              <span className="ts-mobile-divider">/</span>
                              <span className="ts-mobile-norm">{monthNormHours}</span>
                            </strong>
                          </div>
                          <div className={`ts-mobile-kpi overtime ${stats.overtimeHours > 0 ? 'over' : ''}`}>
                            <span>Перераб.</span>
                            <strong>{stats.overtimeHours > 0 ? `+${stats.overtimeHours.toLocaleString('ru-RU')}` : '0'}</strong>
                          </div>
                        </div>

                        <div className="ts-mobile-week-strip">
                          {daysToShow.map(day => {
                            const date = new Date(year, month - 1, day)
                            const entry = timesheetMap.get(day)
                            const visual = getCellVisual(entry, date)
                            const weekend = isWeekendDay(year, month, day)
                            const dateStr = toIsoDate(year, month, day)

                            return (
                              <button
                                key={`${emp.id}-${day}`}
                                type="button"
                                className={`ts-mobile-day-cell ${weekend ? 'is-weekend' : ''}`}
                                onClick={() => onCellClick?.(emp.id, dateStr)}
                                title={visual?.title || ''}
                              >
                                <span className="ts-mobile-day-label">
                                  <span>{DOW_NAMES[getDayDowMonday(year, month, day)]}</span>
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
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
