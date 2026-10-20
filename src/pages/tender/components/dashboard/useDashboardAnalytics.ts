import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import type { EmployeeWithStats, TimesheetEntry } from '../../types'
import {
  calculateSalary,
  getDailyHoursNorm,
  getSalaryForMonth,
  isWeekendOrHoliday,
  roundTimesheetHours
} from '../../utils/salaryCalculator'
import {
  calculateEmployeeMonthlyPayrollPlan,
  getExtraBonusKey,
  getSavedTransport,
  parseExtraBonuses
} from '../../utils/livePayroll'
import { getHireMonthIndex, monthIndex } from '../../utils/employeeFormat'
import { createEmptyTimesheetStatusCounts } from '../../utils/timesheetStatus'
import {
  MONTHS_WINDOW,
  NO_SUBDIVISION,
  type IEmployeeTrend,
  type IEmployeeTrendPoint,
  type IMonthSlot
} from './dashboardTypes'

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthLabel(year: number, month: number): { full: string; short: string } {
  const date = new Date(year, month - 1, 1)
  const short = date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')
  const capShort = short.charAt(0).toUpperCase() + short.slice(1)
  return { full: `${capShort} ${year}`, short: capShort }
}

function getWeekdayNormHours(date: Date): number {
  if (isWeekendOrHoliday(date)) return 0

  const day = date.getDay()
  if (day >= 1 && day <= 4) return 9
  if (day === 5) return 8
  return 0
}

function getMonthWeekdayNormHours(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let total = 0

  for (let day = 1; day <= daysInMonth; day++) {
    total += getWeekdayNormHours(new Date(year, month - 1, day))
  }

  return total
}

function getMonthWeekdayNormDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let total = 0

  for (let day = 1; day <= daysInMonth; day++) {
    if (!isWeekendOrHoliday(new Date(year, month - 1, day))) {
      total += 1
    }
  }

  return total
}

// Выбранный месяц и MONTHS_WINDOW предыдущих (по возрастанию)
function buildMonthSlots(anchorYear: number, anchorMonth: number): IMonthSlot[] {
  const result: IMonthSlot[] = []

  for (let offset = MONTHS_WINDOW; offset >= 0; offset--) {
    const date = new Date(anchorYear, anchorMonth - 1 - offset, 1)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const labels = monthLabel(year, month)
    result.push({ year, month, key: monthKey(year, month), label: labels.full, short: labels.short })
  }

  return result
}

interface IBuildPointInput {
  employee: EmployeeWithStats
  slot: IMonthSlot
  timesheet: TimesheetEntry[]
  transport: number
}

function buildPoint({ employee, slot, timesheet, transport }: IBuildPointInput): IEmployeeTrendPoint {
  const hasTimesheet = timesheet.length > 0
  const normHoursWeekdays = getMonthWeekdayNormHours(slot.year, slot.month)
  const normWorkdays = getMonthWeekdayNormDays(slot.year, slot.month)
  const slotExtraBonuses = parseExtraBonuses(localStorage.getItem(getExtraBonusKey(slot.year, slot.month)))

  // До приёма на работу плана нет
  const hireIndex = getHireMonthIndex(employee.hire_date)
  const plan = hireIndex !== null && hireIndex > monthIndex(slot.year, slot.month)
    ? 0
    : calculateEmployeeMonthlyPayrollPlan(employee, slot.year, slot.month, transport, slotExtraBonuses)

  const statusCounts = createEmptyTimesheetStatusCounts()
  let hours = 0
  let workedWeekdays = 0
  let overtime = 0
  let weekendDays = 0

  for (const entry of timesheet) {
    statusCounts[entry.status] += 1

    const entryDate = new Date(`${entry.work_date}T12:00:00`)
    const weekendOrHoliday = isWeekendOrHoliday(entryDate)

    if (entry.status === 'sick_worked' && !weekendOrHoliday) {
      workedWeekdays += 1
    }

    if (entry.status !== 'work' && entry.status !== 'remote') continue

    const expectedHours = getDailyHoursNorm(entryDate)
    let workedHours = roundTimesheetHours(entry.hours_worked, expectedHours)

    // Импорт "У" проставляет 8 часов. Для удалёнки в будни считаем это полной нормой дня (9/8),
    // иначе факт по часам занижается даже при полностью отработанном месяце.
    if (
      entry.status === 'remote'
      && !weekendOrHoliday
      && entry.hours_worked === 8
      && !entry.is_correction
    ) {
      workedHours = expectedHours
    }

    hours += workedHours
    overtime += Math.max(0, workedHours - expectedHours)

    if (weekendOrHoliday && workedHours >= 3) {
      weekendDays += 1
    } else if (!weekendOrHoliday) {
      workedWeekdays += 1
    }
  }

  let earned = 0
  if (hasTimesheet) {
    const salary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, slot.year, slot.month)
    earned = calculateSalary({
      employee_id: employee.id,
      base_salary: salary,
      year: slot.year,
      month: slot.month,
      timesheet,
      transport,
      bonus: (employee.monthly_bonus || 0) + (slotExtraBonuses[employee.id] || 0)
    }).final_salary
  }

  return {
    hasTimesheet,
    hours,
    normHoursWeekdays,
    normWorkdays,
    workedWeekdays,
    overtime,
    weekendDays,
    earned,
    plan,
    statusCounts
  }
}

export interface IDashboardAnalytics {
  monthSlots: IMonthSlot[]
  trends: IEmployeeTrend[]
  loading: boolean
  error: string | null
}

// История табеля за окно месяцев и расчёт факта/плана по каждому сотруднику и месяцу
export function useDashboardAnalytics(
  employees: EmployeeWithStats[],
  year: number,
  month: number
): IDashboardAnalytics {
  const [historyEntries, setHistoryEntries] = useState<TimesheetEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthSlots = useMemo(() => buildMonthSlots(year, month), [year, month])

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      if (employees.length === 0) {
        setHistoryEntries([])
        return
      }

      setLoading(true)
      setError(null)

      try {
        const employeeIds = employees.map(employee => employee.id)
        const rangeStart = new Date(year, month - 1 - MONTHS_WINDOW, 1)
        const rangeEnd = new Date(year, month, 0)

        const { data, error: queryError } = await supabase
          .from('tender_timesheet')
          .select('*')
          .in('employee_id', employeeIds)
          .gte('work_date', toIsoDate(rangeStart))
          .lte('work_date', toIsoDate(rangeEnd))

        if (queryError) throw queryError

        if (!cancelled) {
          setHistoryEntries(((data || []) as TimesheetEntry[]).map(entry => ({
            ...entry,
            hours_worked: entry.hours_worked == null ? null : roundTimesheetHours(entry.hours_worked)
          })))
        }
      } catch (err) {
        console.error('Error loading dashboard history:', err)
        if (!cancelled) {
          setHistoryEntries([])
          setError(err instanceof Error ? err.message : 'Не удалось загрузить историю табеля')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [employees, year, month])

  const trends = useMemo<IEmployeeTrend[]>(() => {
    const transport = getSavedTransport()

    const entriesByEmployeeMonth = new Map<string, TimesheetEntry[]>()
    for (const entry of historyEntries) {
      const entryDate = new Date(`${entry.work_date}T12:00:00`)
      const key = `${entry.employee_id}:${monthKey(entryDate.getFullYear(), entryDate.getMonth() + 1)}`
      const list = entriesByEmployeeMonth.get(key) || []
      list.push(entry)
      entriesByEmployeeMonth.set(key, list)
    }

    return employees.map(employee => {
      const points = monthSlots.map(slot => buildPoint({
        employee,
        slot,
        timesheet: entriesByEmployeeMonth.get(`${employee.id}:${slot.key}`) || [],
        transport
      }))

      return {
        employee,
        subdivision: employee.subdivision || employee.department || NO_SUBDIVISION,
        points,
        latest: points[points.length - 1],
        previous: points.length > 1 ? points[points.length - 2] : null
      }
    })
  }, [employees, historyEntries, monthSlots])

  return { monthSlots, trends, loading, error }
}
