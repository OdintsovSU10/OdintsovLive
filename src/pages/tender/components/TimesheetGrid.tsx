import { Fragment, useEffect, useMemo, useState } from 'react'
import type { EmployeeWithStats, TimesheetEntry } from '../types'
import { toIsoDate } from '../utils/employeeFormat'
import { GroupByDeptToggle, useGroupByDept } from './GroupByDeptToggle'
import {
  buildTimesheetMap,
  buildWeeks,
  DOW_NAMES,
  EMPTY_TIMESHEET_STATS,
  getCellVisual,
  getDayDowMonday,
  getEmployeeStats,
  getMonthNormDays,
  getMonthNormHours,
  isFutureDay,
  isWeekendDay,
  LEGEND_ITEMS
} from '../utils/timesheetCells'
import type { ITimesheetEmployeeStats } from '../utils/timesheetCells'
import { TimesheetDaySheet } from './TimesheetDaySheet'
import { TimesheetMobileList } from './TimesheetMobileList'
import type { ITimesheetMobileDay, ITimesheetSection } from './TimesheetMobileList'
import './TimesheetGrid.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onCellClick?: (employeeId: number, date: string) => void
  // Открыть карточку сотрудника из шторки дня
  onSelectEmployee?: (employee: EmployeeWithStats) => void
}

type ViewMode = 'month' | 'week'

interface IDaySelection {
  employee: EmployeeWithStats
  iso: string
}

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

const EMPTY_DAY_ENTRIES = new Map<number, TimesheetEntry>()

const getPositionPriority = (position: string | undefined): number => {
  const p = position?.toLowerCase() || ''
  if (p.includes('руководитель')) return 0
  if (p.includes('старший группы')) return 1
  return 2
}

export function TimesheetGrid({ employees, year, month, onCellClick, onSelectEmployee }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({})
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<number | null>(null)
  const [groupByDept, setGroupByDept] = useGroupByDept('tender.timesheet.groupByDept')
  const [legendOpen, setLegendOpen] = useState(false)
  const [daySelection, setDaySelection] = useState<IDaySelection | null>(null)
  const [today] = useState(() => new Date())
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
  ))

  const daysInMonth = new Date(year, month, 0).getDate()
  const allDays = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const monthNormHours = useMemo(() => getMonthNormHours(year, month, allDays), [allDays, month, year])
  const monthNormDays = useMemo(() => getMonthNormDays(year, month, allDays), [allDays, month, year])
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
      weekend: isWeekendDay(year, month, day),
      future: isFutureDay(year, month, day, today)
    }))
  ), [daysToShow, month, today, year])

  // Клик по дню открывает шторку с проходами; будущие дни не открываются
  const openDay = (employee: EmployeeWithStats, iso: string) => {
    setDaySelection({ employee, iso })
    onCellClick?.(employee.id, iso)
  }

  const openEmployeeFromSheet = (employee: EmployeeWithStats) => {
    setDaySelection(null)
    onSelectEmployee?.(employee)
  }

  const toggleDepartment = (department: string) => {
    setCollapsedDepartments(previous => ({ ...previous, [department]: !previous[department] }))
  }

  // Смена месяца закрывает шторку: выбранный день принадлежит прежнему месяцу
  useEffect(() => {
    setDaySelection(null)
  }, [month, year])

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

          <GroupByDeptToggle className="ts-dept-switch" checked={groupByDept} onChange={setGroupByDept} />

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
                    const stats = employeeStats.get(emp.id) || EMPTY_TIMESHEET_STATS
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
                          const hint = visual?.title || 'Нет записи'

                          return (
                            <td
                              key={`${emp.id}-${day}`}
                              className={`ts-cell ${weekend ? 'ts-weekend' : ''} ${getDayDowMonday(year, month, day) === 6 ? 'ts-day-end' : ''}`}
                            >
                              <button
                                type="button"
                                className={`ts-day-btn ${visual?.className ?? 'ts-day-empty'}`}
                                disabled={isFutureDay(year, month, day, today)}
                                onClick={() => openDay(emp, dateStr)}
                                title={hint}
                                aria-label={`${emp.full_name}, ${day}: ${hint}`}
                              >
                                {visual ? visual.label : '·'}
                                {entry?.is_correction && <span className="ts-correction-dot" />}
                              </button>
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
          onToggleSection={toggleDepartment}
          onDayClick={openDay}
        />
      )}

      {daySelection && (
        <TimesheetDaySheet
          employee={daySelection.employee}
          year={year}
          month={month}
          date={daySelection.iso}
          entriesByDay={timesheetByEmployee.get(daySelection.employee.id) || EMPTY_DAY_ENTRIES}
          onClose={() => setDaySelection(null)}
          onChangeDate={iso => setDaySelection({ employee: daySelection.employee, iso })}
          onOpenEmployee={onSelectEmployee ? openEmployeeFromSheet : undefined}
        />
      )}
    </div>
  )
}
