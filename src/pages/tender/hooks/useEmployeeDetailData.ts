import { useMemo } from 'react'
import { getWorkDaysNorm } from '../../../lib/workNorms'
import { calculateSalary, getDailyHoursNorm, getSalaryForMonth, isWeekendOrHoliday } from '../utils/salaryCalculator'
import {
  calculateEmployeeMonthlyPayrollPlan,
  DEFAULT_TRANSPORT,
  getExtraBonusKey,
  getSavedTransport,
  parseExtraBonuses
} from '../utils/livePayroll'
import {
  createEmptyTimesheetStatusCounts,
  isWorkedTimesheetStatus,
  type TimesheetStatusCounts
} from '../utils/timesheetStatus'
import { resolveTimesheetWorkedHours } from '../utils/attendanceDay'
import type { EmployeeWithStats, TimesheetEntry } from '../types'

export interface EmployeeHistoryPoint {
  year: number
  month: number
  hasTimesheet: boolean
  salary: number
  workdaysSalary: number
  hours: number
  normHours: number
  overtime: number
  workedDays: number
  normDays: number
  weekendDays: number
  weekendBonus: number
  transportPayment: number
  earned: number
  statusCounts: TimesheetStatusCounts
}

function readTransport(): number {
  try {
    return getSavedTransport()
  } catch {
    return DEFAULT_TRANSPORT
  }
}

function readExtraBonuses(year: number, month: number): Record<number, number> {
  try {
    return parseExtraBonuses(localStorage.getItem(getExtraBonusKey(year, month)))
  } catch {
    return {}
  }
}

function buildPoint(
  employee: EmployeeWithStats,
  year: number,
  month: number,
  monthTimesheet: TimesheetEntry[],
  transport: number
): EmployeeHistoryPoint {
  const normDays = getWorkDaysNorm(year, month - 1)
  const statusCounts = createEmptyTimesheetStatusCounts()

  if (monthTimesheet.length === 0) {
    return {
      year,
      month,
      hasTimesheet: false,
      salary: 0,
      workdaysSalary: 0,
      hours: 0,
      normHours: 0,
      overtime: 0,
      workedDays: 0,
      normDays,
      weekendDays: 0,
      weekendBonus: 0,
      transportPayment: 0,
      earned: 0,
      statusCounts
    }
  }

  const salary = getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month)
  const extraBonuses = readExtraBonuses(year, month)
  const monthBonus = (employee.monthly_bonus || 0) + (extraBonuses[employee.id] || 0)
  const salaryCalc = calculateSalary({
    employee_id: employee.id,
    base_salary: salary,
    year,
    month,
    timesheet: monthTimesheet,
    transport,
    bonus: monthBonus
  })

  let hours = 0
  let overtime = 0
  let workedDays = 0
  let weekendDays = 0
  let normHours = 0
  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    if (!isWeekendOrHoliday(date)) {
      normHours += getDailyHoursNorm(date)
    }
  }

  for (const entry of monthTimesheet) {
    statusCounts[entry.status] += 1
    if (!isWorkedTimesheetStatus(entry.status)) continue
    const date = new Date(`${entry.work_date}T12:00:00`)
    const workedHours = resolveTimesheetWorkedHours(entry, date)
    hours += workedHours
    overtime += Math.max(0, workedHours - getDailyHoursNorm(date))

    // Удалёнка и работа на больничном считаются днём независимо от часов
    const countsAsDay = entry.status === 'remote' || entry.status === 'sick_worked' || workedHours >= 3
    if (!countsAsDay) continue
    if (isWeekendOrHoliday(date)) {
      weekendDays += 1
    } else {
      workedDays += 1
    }
  }

  return {
    year,
    month,
    hasTimesheet: true,
    salary,
    workdaysSalary: Math.round((salaryCalc.calculated_salary - salaryCalc.weekend_payment) * 100) / 100,
    hours: Math.round(hours),
    normHours: Math.round(normHours),
    overtime: Math.round(overtime * 10) / 10,
    workedDays,
    normDays,
    weekendDays,
    weekendBonus: salaryCalc.weekend_payment,
    transportPayment: salaryCalc.transport_payment,
    earned: salaryCalc.final_salary,
    statusCounts
  }
}

// Расчёты по табелю года: 12 точек динамики, план месяца, средние
export function useEmployeeDetailData(
  employee: EmployeeWithStats,
  year: number,
  month: number,
  yearEntries: TimesheetEntry[] | null
) {
  const transport = useMemo(() => readTransport(), [])

  const history = useMemo<EmployeeHistoryPoint[]>(() => {
    const byMonth = new Map<number, TimesheetEntry[]>()
    for (const entry of yearEntries || []) {
      const entryMonth = Number(entry.work_date.slice(5, 7))
      const list = byMonth.get(entryMonth) || []
      list.push(entry)
      byMonth.set(entryMonth, list)
    }
    return Array.from({ length: 12 }, (_, index) => (
      buildPoint(employee, year, index + 1, byMonth.get(index + 1) || [], transport)
    ))
  }, [employee, transport, year, yearEntries])

  const point = history[month - 1]

  const entriesByDay = useMemo(() => {
    const map = new Map<number, TimesheetEntry[]>()
    for (const entry of yearEntries || []) {
      if (Number(entry.work_date.slice(5, 7)) !== month) continue
      const dayNumber = Number(entry.work_date.slice(8, 10))
      map.set(dayNumber, [...(map.get(dayNumber) || []), entry])
    }
    // Если на день несколько записей — берём последнюю, как раньше при сборке карты дней
    return new Map([...map].map(([dayNumber, list]) => [dayNumber, list[list.length - 1]]))
  }, [month, yearEntries])

  const monthlyPlan = useMemo(
    () => calculateEmployeeMonthlyPayrollPlan(employee, year, month, transport, readExtraBonuses(year, month)),
    [employee, month, transport, year]
  )

  const baseSalary = useMemo(
    () => getSalaryForMonth(employee.salaryHistory || [], employee.current_salary, year, month),
    [employee.current_salary, employee.salaryHistory, month, year]
  )

  const yearlyPoints = useMemo(() => history.filter(item => item.hasTimesheet), [history])
  const averageMonthlyIncome = useMemo(() => {
    if (yearlyPoints.length === 0) return baseSalary + (employee.monthly_bonus || 0) + transport
    return Math.round(yearlyPoints.reduce((sum, item) => sum + item.earned, 0) / yearlyPoints.length)
  }, [baseSalary, employee.monthly_bonus, transport, yearlyPoints])
  const averageWeekendIncome = useMemo(() => (
    yearlyPoints.length === 0
      ? 0
      : yearlyPoints.reduce((sum, item) => sum + item.weekendBonus, 0) / yearlyPoints.length
  ), [yearlyPoints])

  return {
    history,
    point,
    entriesByDay,
    monthlyPlan,
    baseSalary,
    transport,
    averageMonthlyIncome,
    averageWeekendIncome,
    hasYearData: yearlyPoints.length > 0
  }
}
