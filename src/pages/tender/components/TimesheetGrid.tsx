import { useMemo, Fragment } from 'react'
import type { EmployeeWithStats, TimesheetEntry, TimesheetStatus } from '../types'
import { getDailyHoursNorm, isWeekendOrHoliday } from '../utils/salaryCalculator'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import './TimesheetGrid.css'

interface Props {
  employees: EmployeeWithStats[]
  year: number
  month: number
  onCellClick?: (employeeId: number, date: string) => void
}

const STATUS_LABELS: Record<TimesheetStatus, string> = {
  work: 'Работа',
  remote: 'Удалённо',
  vacation: 'Отпуск',
  dayoff: 'Выходной',
  absent: 'Прогул',
  unpaid: 'За свой счёт'
}

const formatShortName = (emp: EmployeeWithStats): string => {
  if (emp.last_name && emp.first_name) {
    const firstInitial = emp.first_name.charAt(0).toUpperCase()
    const middleInitial = emp.middle_name ? ` ${emp.middle_name.charAt(0).toUpperCase()}.` : ''
    return `${emp.last_name} ${firstInitial}.${middleInitial}`
  }
  return emp.full_name
}

const getPositionPriority = (position: string | undefined): number => {
  const p = position?.toLowerCase() || ''
  if (p.includes('руководитель')) return 0
  if (p.includes('старший группы')) return 1
  return 2
}

export function TimesheetGrid({ employees, year, month, onCellClick }: Props) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Группировка: руководители наверху отдельной группой, потом по subdivision
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

    // Сортируем внутри групп: старшие группы наверху
    groups.forEach(emps => {
      emps.sort((a, b) => getPositionPriority(a.position) - getPositionPriority(b.position))
    })

    const result: [string, EmployeeWithStats[]][] = []

    // Руководители первыми
    if (managers.length > 0) {
      result.push(['Руководители', managers])
    }

    // Остальные группы по алфавиту
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    result.push(...sortedGroups)

    return result
  }, [employees])

  const getDayOfWeek = (day: number): string => {
    const date = new Date(year, month - 1, day)
    return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()]
  }

  const isWeekend = (day: number): boolean => {
    const date = new Date(year, month - 1, day)
    return isWeekendOrHoliday(date)
  }

  const getTimesheetMap = (timesheet?: TimesheetEntry[]): Map<number, TimesheetEntry> => {
    const map = new Map<number, TimesheetEntry>()
    if (!timesheet) return map

    for (const entry of timesheet) {
      const d = new Date(entry.work_date)
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        map.set(d.getDate(), entry)
      }
    }
    return map
  }

  const getStatusClass = (status: TimesheetStatus): string => {
    return `ts-cell ts-${status}`
  }

  const hasDeviation = (entry: TimesheetEntry, day: number): boolean => {
    if (entry.status !== 'work') return false
    const date = new Date(year, month - 1, day)
    const isWeekend = isWeekendOrHoliday(date)
    const norm = getDailyHoursNorm(date)
    const actual = entry.hours_worked || 0
    // В выходной минимум 5 часов, в будний - норма дня
    const minHours = isWeekend ? 5 : norm
    return actual < minHours - 0.5
  }

  const workDaysNorm = getWorkDaysNorm(year, month - 1)

  const employeeStats = useMemo(() => {
    return employees.map(emp => {
      const map = getTimesheetMap(emp.timesheet)
      let workDays = 0
      let remoteDays = 0
      let vacationDays = 0
      let weekendWorkDays = 0
      let totalHours = 0

      map.forEach((entry, day) => {
        const date = new Date(year, month - 1, day)
        const isWeekend = isWeekendOrHoliday(date)

        if (entry.status === 'work') {
          const hours = entry.hours_worked || 0
          if (isWeekend) {
            // Выходной засчитывается только если >= 3 часов
            if (hours >= 3) weekendWorkDays++
          } else {
            workDays++
          }
          totalHours += hours
        } else if (entry.status === 'remote') {
          const hours = entry.hours_worked || 8
          if (isWeekend) {
            // Удалёнка в выходной тоже считается рабочим выходным (>= 3ч)
            if (hours >= 3) weekendWorkDays++
          } else {
            remoteDays++
          }
          totalHours += hours
        } else if (entry.status === 'vacation') {
          vacationDays++
        }
      })

      return {
        id: emp.id,
        workDays: workDays + remoteDays,
        workDaysNorm,
        weekendWorkDays,
        vacationDays,
        totalHours
      }
    })
  }, [employees, year, month, workDaysNorm])

  return (
    <div className="timesheet-grid">
      <div className="timesheet-table-wrapper">
        <table className="timesheet-table">
          <thead>
            <tr>
              <th className="ts-name-col">Сотрудник</th>
              {days.map(day => (
                <th
                  key={day}
                  className={`ts-day-col ${isWeekend(day) ? 'ts-weekend-header' : ''}`}
                >
                  <div className="ts-day-header">
                    <span className="ts-day-num">{day}</span>
                    <span className="ts-day-name">{getDayOfWeek(day)}</span>
                  </div>
                </th>
              ))}
              <th className="ts-total-col" title="Рабочие дни / норма">Раб.</th>
              <th className="ts-total-col" title="Работа в выходные">Вых.</th>
              <th className="ts-total-col">Часы</th>
            </tr>
          </thead>
          <tbody>
            {groupedEmployees.map(([subdivision, groupEmps]) => (
              <Fragment key={subdivision}>
                <tr className="ts-group-header">
                  <td colSpan={days.length + 4} className="ts-group-cell">
                    {subdivision} ({groupEmps.length})
                  </td>
                </tr>
                {groupEmps.map(emp => {
                  const map = getTimesheetMap(emp.timesheet)
                  const empIndex = employees.findIndex(e => e.id === emp.id)
                  const stats = employeeStats[empIndex]
                  const isManager = getPositionPriority(emp.position) < 2

                  return (
                    <tr key={emp.id} className={isManager ? 'ts-manager-row' : ''}>
                      <td className="ts-name-cell">
                        <span className="ts-emp-name">{formatShortName(emp)}</span>
                        {isManager && <span className="ts-manager-badge">{emp.position}</span>}
                      </td>
                      {days.map(day => {
                        const entry = map.get(day)
                        const weekend = isWeekend(day)
                        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

                        if (!entry) {
                          return (
                            <td
                              key={day}
                              className={`ts-cell ts-empty ${weekend ? 'ts-weekend' : ''}`}
                              onClick={() => onCellClick?.(emp.id, dateStr)}
                            />
                          )
                        }

                        const deviation = hasDeviation(entry, day)

                        return (
                          <td
                            key={day}
                            className={`${getStatusClass(entry.status)} ${weekend ? 'ts-weekend' : ''} ${deviation ? 'ts-deviation' : ''} ${entry.is_correction ? 'ts-correction' : ''}`}
                            title={`${STATUS_LABELS[entry.status]}${entry.hours_worked ? ` (${entry.hours_worked}ч)` : ''}${entry.is_correction ? ' [Кор]' : ''}`}
                            onClick={() => onCellClick?.(emp.id, dateStr)}
                          >
                            {entry.status === 'work' && entry.hours_worked && (
                              <span className="ts-hours">{entry.hours_worked % 1 === 0 ? entry.hours_worked : entry.hours_worked.toFixed(1)}</span>
                            )}
                            {entry.status === 'remote' && <span className="ts-status-label">У</span>}
                          </td>
                        )
                      })}
                      <td className="ts-total-cell">
                        <span className={stats.workDays < stats.workDaysNorm ? 'ts-under-norm' : ''}>
                          {stats.workDays}/{stats.workDaysNorm}
                        </span>
                      </td>
                      <td className="ts-total-cell">{stats.weekendWorkDays || '—'}</td>
                      <td className="ts-total-cell">{Math.round(stats.totalHours)}</td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="timesheet-legend">
        <div className="ts-legend-item"><span className="ts-dot ts-work" /> Работа</div>
        <div className="ts-legend-item"><span className="ts-dot ts-remote" /> Удалённо</div>
        <div className="ts-legend-item"><span className="ts-dot ts-vacation" /> Отпуск</div>
        <div className="ts-legend-item"><span className="ts-dot ts-dayoff" /> Выходной</div>
        <div className="ts-legend-item"><span className="ts-dot ts-absent" /> Прогул</div>
        <div className="ts-legend-item"><span className="ts-dot ts-deviation-dot" /> Отклонение</div>
      </div>
    </div>
  )
}
