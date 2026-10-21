import { Fragment, useEffect, useMemo, useState } from 'react'
import type { EmployeeWithStats, TimesheetEntry } from '../types'
import { getDailyHoursNorm, isWeekendOrHoliday, roundTimesheetHours } from '../utils/salaryCalculator'
import { TIMESHEET_STATUS_META } from '../utils/timesheetStatus'
import { TimesheetMobileList } from './TimesheetMobileList'
import type {
  ITimesheetCellVisual,
  ITimesheetEmployeeStats,
  ITimesheetMobileDay,
  ITimesheetSection
} from './TimesheetMobileList'
import './TimesheetGrid.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onCellClick?: (employeeId: number, date: string) => void
}

type ViewMode = 'month' | 'week'

const DOW_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Цвета подразделений — только токены (--ts-* заданы на .timesheet-grid)
const DEPT_PALETTE = [
  'var(--primary)',
  'var(--chart-2)',
  'var(--chart-positive)',
  'var(--chart-warning)',
  'var(--chart-negative)',
  'var(--ts-edu)',
  'var(--ts-sick-worked)',
  'var(--text-secondary)'
]
const DEFAULT_DEPT_COLOR = 'var(--text-secondary)'

const GROUP_STORAGE_KEY = 'tender.timesheet.groupByDept'

const EMPTY_STATS: ITimesheetEmployeeStats = {
  workDays: 0,
  remoteDays: 0,
  vacationDays: 0,
  weekendDays: 0,
  totalHours: 0,
  overtimeHours: 0
}

const LEGEND_ITEMS: { chip: string; sample: string; label: string }[] = [
  { chip: 'ts-legend-weekend', sample: '', label: 'Выходные дни' },
  { chip: 'ts-tone-workday', sample: '9', label: 'Рабочие дни (будни)' },
  { chip: 'ts-tone-weekend', sample: '5', label: 'Работа в выходной' },
  { chip: 'ts-state-low', sample: '7', label: 'Недоработка (ярлык <9/<8/<5)' },
  { chip: 'ts-state-critical', sample: '2', label: 'Критично (<3ч)' },
  { chip: 'ts-state-high', sample: '11', label: 'Повышенная нагрузка (>10ч)' },
  { chip: 'ts-status-vacation', sample: 'От', label: 'Отпуск' },
  { chip: 'ts-status-sick', sample: 'Б', label: 'Больничный' },
  { chip: 'ts-status-absent', sample: 'Н', label: 'Неявка' },
  { chip: 'ts-status-dayoff', sample: 'В', label: 'Выходной' },
  { chip: 'ts-status-remote', sample: 'УУ', label: 'Удалёнка' },
  { chip: 'ts-status-unpaid', sample: 'С', label: 'За свой счёт' },
  { chip: 'ts-status-educational', sample: 'У', label: 'Учебный отпуск' },
  { chip: 'ts-status-sick-worked', sample: 'РБ', label: 'Работа на больничном' }
]

const readGroupByDept = (): boolean => {
  try {
    return localStorage.getItem(GROUP_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

const writeGroupByDept = (value: boolean): void => {
  try {
    localStorage.setItem(GROUP_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // хранилище недоступно — настройка живёт только в сессии
  }
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

const formatHours = (value: number): string => String(roundTimesheetHours(value))

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
  if (entry.status !== 'work' && entry.status !== 'remote' && entry.status !== 'sick_worked') return 0

  const expectedHours = getDailyHoursNorm(date)
  if (entry.status === 'sick_worked') {
    return roundTimesheetHours(entry.hours_worked) || expectedHours
  }

  const weekendOrHoliday = isWeekendOrHoliday(date)
  const rawHours = roundTimesheetHours(entry.hours_worked, expectedHours)

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

  return roundTimesheetHours(rawHours)
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

const getEmployeeStats = (timesheetMap: Map<number, TimesheetEntry>, year: number, month: number, days: number[]): ITimesheetEmployeeStats => {
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

    if (entry.status === 'work' || entry.status === 'remote' || entry.status === 'sick_worked') {
      const hours = getWorkedHours(entry, date)
      totalHours += hours
      overtimeHours += Math.max(0, hours - getDailyHoursNorm(date))

      if (entry.status === 'remote') {
        remoteDays += 1
      }

      if (weekend) {
        if (entry.status === 'remote' || entry.status === 'sick_worked' || hours >= 3) weekendDays += 1
      } else {
        if (entry.status === 'remote' || entry.status === 'sick_worked' || hours >= 3) {
          workDays += 1
        }
      }
      continue
    }

    if (entry.status === 'vacation' || entry.status === 'educational_leave') {
      vacationDays += 1
    }
  }

  return {
    workDays,
    remoteDays,
    vacationDays,
    weekendDays,
    totalHours: Math.round(totalHours),
    overtimeHours: Math.round(overtimeHours)
  }
}

const getCellVisual = (
  entry: TimesheetEntry | undefined,
  date: Date
): ITimesheetCellVisual | null => {
  if (!entry) return null

  if (entry.status === 'work' || entry.status === 'remote') {
    const hours = getWorkedHours(entry, date)
    const rawHours = roundTimesheetHours(entry.hours_worked, getDailyHoursNorm(date))
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

    const titlePrefix = entry.status === 'remote'
      ? TIMESHEET_STATUS_META.remote.label
      : TIMESHEET_STATUS_META.work.label
    const hasAdjustedHours = Math.abs(rawHours - hours) > 0.001
    const title = hasAdjustedHours
      ? `${titlePrefix}. Факт в табеле: ${formatHours(rawHours)} ч. Учтено в расчёте: ${formatHours(hours)} ч. Норма дня: ${minimumHours} ч.`
      : `${titlePrefix}. Отработано: ${formatHours(hours)} ч. Норма дня: ${minimumHours} ч.`

    return {
      label: entry.status === 'remote' ? TIMESHEET_STATUS_META.remote.short : formatHours(hours),
      className: `ts-pill ${entry.status === 'remote' ? 'ts-pill-status' : 'ts-pill-hours'} ${baseTone} ${stateTone}`,
      title,
      underworkTag: isUnderworked ? getUnderworkTag(date) : undefined
    }
  }

  if (entry.status === 'sick_worked') {
    const hours = getWorkedHours(entry, date)
    const meta = TIMESHEET_STATUS_META.sick_worked
    return {
      label: meta.short,
      className: `ts-pill ts-pill-status ts-status-${meta.className}`,
      title: `${meta.label}. Учтено: ${formatHours(hours)} ч.`
    }
  }

  const meta = TIMESHEET_STATUS_META[entry.status]
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
  const [groupByDept, setGroupByDept] = useState<boolean>(readGroupByDept)
  const [legendOpen, setLegendOpen] = useState(false)
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
    const stats = new Map<number, ITimesheetEmployeeStats>()
    for (const employee of employees) {
      const timesheetMap = timesheetByEmployee.get(employee.id) || new Map<number, TimesheetEntry>()
      stats.set(employee.id, getEmployeeStats(timesheetMap, year, month, allDays))
    }
    return stats
  }, [allDays, employees, month, timesheetByEmployee, year])

  // Цвет сотрудника — цвет его группы (не зависит от режима «По подразделениям»)
  const employeeColors = useMemo(() => {
    const colors = new Map<number, string>()
    groupedEmployees.forEach(([, groupEmps], index) => {
      const color = DEPT_PALETTE[index % DEPT_PALETTE.length]
      groupEmps.forEach(emp => colors.set(emp.id, color))
    })
    return colors
  }, [groupedEmployees])

  const sections = useMemo<ITimesheetSection[]>(() => {
    if (groupByDept) {
      return groupedEmployees.map(([key, groupEmps]) => ({ key, title: key, employees: groupEmps }))
    }
    const flat = [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
    return [{ key: '__all', title: null, employees: flat }]
  }, [employees, groupByDept, groupedEmployees])

  const mobileDays = useMemo<ITimesheetMobileDay[]>(() => (
    daysToShow.map(day => ({
      day,
      date: new Date(year, month - 1, day),
      iso: toIsoDate(year, month, day),
      dowName: DOW_NAMES[getDayDowMonday(year, month, day)],
      weekend: isWeekendDay(year, month, day)
    }))
  ), [daysToShow, month, year])

  const toggleDepartment = (department: string) => {
    setCollapsedDepartments(previous => ({ ...previous, [department]: !previous[department] }))
  }

  const toggleGroupByDept = () => {
    const next = !groupByDept
    setGroupByDept(next)
    writeGroupByDept(next)
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
      <h2 className="ts-sr-only">Табель учёта рабочего времени</h2>

      <div className="ts-toolbar">
        <div className="ts-toolbar-controls">
          <button
            type="button"
            className="ts-toolbar-btn"
            aria-pressed={groupByDept}
            onClick={toggleGroupByDept}
          >
            <span className="ts-check-box" aria-hidden="true">
              <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
                <path d="M2.2 6.3 4.8 8.8 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            По подразделениям
          </button>

          {isMobile && (
            <button
              type="button"
              className="ts-toolbar-btn"
              aria-expanded={legendOpen}
              aria-controls="ts-legend"
              onClick={() => setLegendOpen(previous => !previous)}
            >
              Обозначения
            </button>
          )}

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

      {(!isMobile || legendOpen) && (
        <div className="timesheet-legend" id="ts-legend">
          {!isMobile && <span className="ts-legend-title">Легенда</span>}
          {LEGEND_ITEMS.map(item => (
            <div key={item.chip} className="ts-legend-item">
              <span className={`ts-legend-chip ts-legend-code ${item.chip}`}>{item.sample}</span> {item.label}
            </div>
          ))}
        </div>
      )}

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
              {sections.map(section => (
                <Fragment key={section.key}>
                  {section.title !== null && (
                    <tr className="ts-group-header-row" onClick={() => toggleDepartment(section.key)}>
                      <td colSpan={daysToShow.length + 2} className="ts-group-cell">
                        <span className={`ts-group-toggle ${collapsedDepartments[section.key] ? 'is-collapsed' : ''}`}>▼</span>
                        <span
                          className="ts-group-mark"
                          style={{ background: employeeColors.get(section.employees[0]?.id) || DEFAULT_DEPT_COLOR }}
                        />
                        <span className="ts-group-title">{section.title}</span>
                        <span className="ts-group-count">({section.employees.length})</span>
                      </td>
                    </tr>
                  )}
                  {(section.title === null || !collapsedDepartments[section.key]) && section.employees.map(emp => {
                    const timesheetMap = timesheetByEmployee.get(emp.id) || new Map<number, TimesheetEntry>()
                    const stats = employeeStats.get(emp.id) || EMPTY_STATS
                    const deptColor = employeeColors.get(emp.id) || DEFAULT_DEPT_COLOR

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
                                color: deptColor,
                                borderColor: `color-mix(in srgb, ${deptColor} 25%, transparent)`,
                                background: `color-mix(in srgb, ${deptColor} 10%, transparent)`
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
        <TimesheetMobileList
          sections={sections}
          days={mobileDays}
          collapsed={collapsedDepartments}
          employeeColors={employeeColors}
          timesheetByEmployee={timesheetByEmployee}
          employeeStats={employeeStats}
          monthNormDays={monthNormDays}
          monthNormHours={monthNormHours}
          getCellVisual={getCellVisual}
          onToggleSection={toggleDepartment}
          onCellClick={onCellClick}
        />
      )}
    </div>
  )
}
