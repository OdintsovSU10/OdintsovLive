import { Fragment, useEffect, useMemo, useState } from 'react'
import type { EmployeeWithStats, TimesheetEntry, WorkPlan } from '../types'
import { getDailyHoursNorm, getRemoteFullDayHours, isWeekendOrHoliday, roundTimesheetHours } from '../utils/salaryCalculator'
import { TIMESHEET_STATUS_META } from '../utils/timesheetStatus'
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

const getWorkedHours = (entry: TimesheetEntry, date: Date, plan?: WorkPlan): number => {
  if (entry.status !== 'work' && entry.status !== 'remote' && entry.status !== 'sick_worked') return 0

  const expectedHours = plan?.is_working_day ? plan.planned_hours : getDailyHoursNorm(date)
  if (entry.status === 'sick_worked') {
    return roundTimesheetHours(entry.hours_worked) || expectedHours
  }

  if (entry.status === 'remote') {
    if (plan) {
      return roundTimesheetHours(entry.hours_worked, plan.is_working_day ? plan.planned_hours : 0)
    }
    return getRemoteFullDayHours(entry.hours_worked, date)
  }

  const rawHours = roundTimesheetHours(entry.hours_worked, expectedHours)
  return roundTimesheetHours(rawHours)
}

const getMinimumHoursForDay = (date: Date): number => {
  if (isWeekendOrHoliday(date)) return WEEKEND_TARGET_HOURS
  if (date.getDay() === 5) return 8
  return 9
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

const buildWorkPlanMap = (plans: WorkPlan[] | undefined, year: number, month: number): Map<number, WorkPlan> => {
  const map = new Map<number, WorkPlan>()
  if (!plans) return map

  for (const plan of plans) {
    const date = new Date(`${plan.work_date}T12:00:00`)
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue
    map.set(date.getDate(), plan)
  }

  return map
}

const getEmployeeStats = (
  timesheetMap: Map<number, TimesheetEntry>,
  workPlanMap: Map<number, WorkPlan>,
  year: number,
  month: number,
  days: number[]
): EmployeeStats => {
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
    const plan = workPlanMap.get(day)
    const weekend = plan ? !plan.is_working_day : isWeekendOrHoliday(date)

    if (entry.status === 'work' || entry.status === 'remote' || entry.status === 'sick_worked') {
      const hours = getWorkedHours(entry, date, plan)
      totalHours += hours
      overtimeHours += Math.max(0, hours - (plan?.planned_hours ?? getDailyHoursNorm(date)))

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
  date: Date,
  plan?: WorkPlan
): { label: string; className: string; title: string; underworkTag?: string } | null => {
  const planTitle = plan
    ? `График: ${plan.schedule_name || plan.schedule_type}. ${plan.is_working_day
      ? `${String(plan.work_start || '').slice(0, 5)}–${String(plan.work_end || '').slice(0, 5)}, план ${formatHours(plan.planned_hours)} ч.`
      : 'Выходной по графику.'}`
    : 'График FOT не загружен.'
  const correctionTitle = entry?.is_correction
    ? ` Корректировка${entry.correction_author ? `: ${entry.correction_author}` : ''}${entry.correction_reason ? ` — ${entry.correction_reason}` : ''}${entry.correction_approval_status ? ` (${entry.correction_approval_status})` : ''}.`
    : ''

  if (!entry) {
    if (!plan?.is_working_day) return null
    return {
      label: formatHours(plan.planned_hours),
      className: 'ts-pill ts-pill-hours ts-plan-only',
      title: `${planTitle} Факт пока отсутствует.`
    }
  }

  if (entry.status === 'work' || entry.status === 'remote') {
    const hours = getWorkedHours(entry, date, plan)
    const rawHours = roundTimesheetHours(entry.hours_worked, plan?.planned_hours ?? getDailyHoursNorm(date))
    const minimumHours = plan?.is_working_day
      ? (plan.full_day_threshold_hours || plan.planned_hours)
      : (plan ? 0 : getMinimumHoursForDay(date))
    const outsidePlan = Boolean(plan && !plan.is_working_day)
    const isUnderworked = minimumHours > 0 && hours < minimumHours
    const isCritical = isUnderworked && hours < 3
    const isOverPlan = plan ? hours > plan.planned_hours : hours > 10
    const baseTone = entry.status === 'remote'
      ? 'ts-tone-remote'
      : (isWeekendOrHoliday(date) ? 'ts-tone-weekend' : 'ts-tone-workday')

    let stateTone = 'ts-state-normal'
    if (isCritical) {
      stateTone = 'ts-state-critical'
    } else if (isUnderworked || outsidePlan) {
      stateTone = 'ts-state-low'
    } else if (isOverPlan) {
      stateTone = 'ts-state-high'
    }

    const titlePrefix = entry.status === 'remote'
      ? TIMESHEET_STATUS_META.remote.label
      : TIMESHEET_STATUS_META.work.label
    const hasAdjustedHours = Math.abs(rawHours - hours) > 0.001
    const factTitle = hasAdjustedHours
      ? `${titlePrefix}. Факт: ${formatHours(rawHours)} ч, учтено: ${formatHours(hours)} ч.`
      : `${titlePrefix}. Факт: ${formatHours(hours)} ч.`
    const complianceTitle = outsidePlan
      ? ' Нарушение: работа вне графика.'
      : (isUnderworked ? ' Нарушение: факт ниже порога полного дня.' : ' График соблюдён.')
    const title = `${planTitle} ${factTitle}${complianceTitle}${correctionTitle}`

    return {
      label: entry.status === 'remote' ? TIMESHEET_STATUS_META.remote.short : formatHours(hours),
      className: `ts-pill ${entry.status === 'remote' ? 'ts-pill-status' : 'ts-pill-hours'} ${baseTone} ${stateTone}`,
      title,
      underworkTag: outsidePlan ? 'вне плана' : (isUnderworked ? `<${formatHours(minimumHours)}ч` : undefined)
    }
  }

  if (entry.status === 'sick_worked') {
    const hours = getWorkedHours(entry, date, plan)
    const meta = TIMESHEET_STATUS_META.sick_worked
    return {
      label: meta.short,
      className: `ts-pill ts-pill-status ts-status-${meta.className}`,
      title: `${planTitle} ${meta.label}. Учтено: ${formatHours(hours)} ч.${correctionTitle}`
    }
  }

  const meta = TIMESHEET_STATUS_META[entry.status]
  return {
    label: meta.short,
    className: `ts-pill ts-pill-status ts-status-${meta.className} ${entry.status === 'absent' && plan?.is_working_day ? 'ts-state-critical' : ''}`,
    title: `${planTitle} ${meta.label}. Отработано: 0 ч.${entry.status === 'absent' && plan?.is_working_day ? ' Нарушение графика.' : ''}${correctionTitle}`,
    underworkTag: entry.status === 'absent' && plan?.is_working_day ? '0ч' : undefined
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
  const fallbackMonthNormHours = useMemo(() => (
    allDays.reduce((sum, day) => {
      const date = new Date(year, month - 1, day)
      if (isWeekendOrHoliday(date)) return sum
      return sum + getTimesheetNormHours(date)
    }, 0)
  ), [allDays, month, year])
  const fallbackMonthNormDays = useMemo(() => (
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

  const workPlansByEmployee = useMemo(() => {
    const map = new Map<number, Map<number, WorkPlan>>()
    for (const employee of employees) {
      map.set(employee.id, buildWorkPlanMap(employee.workPlans, year, month))
    }
    return map
  }, [employees, year, month])

  const employeeStats = useMemo(() => {
    const stats = new Map<number, EmployeeStats>()
    for (const employee of employees) {
      const timesheetMap = timesheetByEmployee.get(employee.id) || new Map<number, TimesheetEntry>()
      const workPlanMap = workPlansByEmployee.get(employee.id) || new Map<number, WorkPlan>()
      stats.set(employee.id, getEmployeeStats(timesheetMap, workPlanMap, year, month, allDays))
    }
    return stats
  }, [allDays, employees, month, timesheetByEmployee, workPlansByEmployee, year])

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
        <div className="ts-legend-item"><span className="ts-legend-chip ts-state-low" /> Нарушение графика FOT</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-state-critical" /> Критично (&lt;3ч)</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-state-high" /> Сверх плана FOT</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-vacation">От</span> Отпуск</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-sick">Б</span> Больничный</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-absent">Н</span> Неявка</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-dayoff">В</span> Выходной</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-remote">УУ</span> Удалёнка</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-unpaid">С</span> За свой счёт</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-educational">У</span> Учебный отпуск</div>
        <div className="ts-legend-item"><span className="ts-legend-chip ts-legend-code ts-status-sick-worked">РБ</span> Работа на больничном</div>
        <div className="ts-legend-item"><span className="ts-correction-dot ts-legend-correction">К</span> Корректировка FOT</div>
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
                    const workPlanMap = workPlansByEmployee.get(emp.id) || new Map<number, WorkPlan>()
                    const hasWorkPlans = workPlanMap.size > 0
                    const monthNormHours = hasWorkPlans
                      ? Array.from(workPlanMap.values()).reduce((sum, plan) => sum + (plan.is_working_day ? plan.planned_hours : 0), 0)
                      : fallbackMonthNormHours
                    const monthNormDays = hasWorkPlans
                      ? Array.from(workPlanMap.values()).filter(plan => plan.is_working_day).length
                      : fallbackMonthNormDays
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
                          const plan = workPlanMap.get(day)
                          const visual = getCellVisual(entry, date, plan)
                          const weekend = plan ? !plan.is_working_day : isWeekendDay(year, month, day)
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
                                  {entry?.is_correction && <span className="ts-correction-dot">К</span>}
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
                    const workPlanMap = workPlansByEmployee.get(emp.id) || new Map<number, WorkPlan>()
                    const hasWorkPlans = workPlanMap.size > 0
                    const monthNormHours = hasWorkPlans
                      ? Array.from(workPlanMap.values()).reduce((sum, plan) => sum + (plan.is_working_day ? plan.planned_hours : 0), 0)
                      : fallbackMonthNormHours
                    const monthNormDays = hasWorkPlans
                      ? Array.from(workPlanMap.values()).filter(plan => plan.is_working_day).length
                      : fallbackMonthNormDays
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
                            const plan = workPlanMap.get(day)
                            const visual = getCellVisual(entry, date, plan)
                            const weekend = plan ? !plan.is_working_day : isWeekendDay(year, month, day)
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
                                    {entry?.is_correction && <span className="ts-correction-dot">К</span>}
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
