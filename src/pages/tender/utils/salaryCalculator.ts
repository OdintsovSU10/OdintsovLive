import { getWorkDaysNorm } from '../../../lib/workNorms'
import type { TimesheetEntry, SalaryCalculation, DepartmentFOT, Employee, SalaryHistory } from '../types'
import { HOLIDAYS } from '../../../lib/constants'

// Нормы часов по дням недели
const DAILY_HOURS: Record<number, number> = {
  1: 9, // Пн
  2: 9, // Вт
  3: 9, // Ср
  4: 9, // Чт
  5: 8, // Пт
  6: 5, // Сб (минимум для работы в выходной)
  0: 5  // Вс
}

// Как в табеле FOT: каждый день арифметически округляется до целого часа,
// а месячный итог складывается уже из округлённых дневных значений.
export function roundTimesheetHours(value: number | null | undefined, fallback = 0): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : Math.max(0, Math.round(fallback))
}

// Средневзвешенный оклад для месяца с учётом изменений в середине месяца
export function getSalaryForMonth(
  salaryHistory: SalaryHistory[],
  currentSalary: number,
  year: number,
  month: number
): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  if (!salaryHistory || salaryHistory.length === 0) {
    return currentSalary
  }

  const sorted = [...salaryHistory].sort((a, b) =>
    a.effective_date.localeCompare(b.effective_date)
  )

  type Period = { start: number; end: number; salary: number }
  const periods: Period[] = []

  let initialSalary = currentSalary
  for (const s of sorted) {
    if (s.effective_date <= monthStart) {
      initialSalary = s.salary
    }
  }

  let currentPeriodStart = 1
  let currentPeriodSalary = initialSalary

  for (const s of sorted) {
    if (s.effective_date > monthStart && s.effective_date <= monthEnd) {
      const changeDay = parseInt(s.effective_date.split('-')[2], 10)
      periods.push({
        start: currentPeriodStart,
        end: changeDay - 1,
        salary: currentPeriodSalary
      })
      currentPeriodStart = changeDay
      currentPeriodSalary = s.salary
    }
  }

  periods.push({
    start: currentPeriodStart,
    end: daysInMonth,
    salary: currentPeriodSalary
  })

  let totalWeightedSalary = 0
  let totalDays = 0
  for (const p of periods) {
    const days = p.end - p.start + 1
    if (days > 0) {
      totalWeightedSalary += p.salary * days
      totalDays += days
    }
  }

  return totalDays > 0 ? Math.round(totalWeightedSalary / totalDays) : currentSalary
}

// Проверка: является ли день выходным или праздником
export function isWeekendOrHoliday(date: Date): boolean {
  const dayOfWeek = date.getDay()
  const month = date.getMonth()
  const day = date.getDate()

  // Выходные (Сб, Вс)
  if (dayOfWeek === 0 || dayOfWeek === 6) return true

  // Праздники
  const monthHolidays = HOLIDAYS[String(month)]
  if (monthHolidays && monthHolidays.includes(day)) return true

  return false
}

// Получить норму часов для дня
export function getDailyHoursNorm(date: Date): number {
  const dayOfWeek = date.getDay()
  return DAILY_HOURS[dayOfWeek] || 8
}

interface SalaryInput {
  employee_id: number
  base_salary: number
  year: number
  month: number
  timesheet: TimesheetEntry[]
  bonus?: number
  deductions?: number
  transport?: number  // базовая ставка проезда за месяц
}

// Расчёт ЗП сотрудника за месяц
export function calculateSalary(input: SalaryInput): SalaryCalculation {
  const { employee_id, base_salary, year, month, timesheet, bonus = 0, deductions = 0, transport = 0 } = input

  // Норма рабочих дней из производственного календаря (месяц 0-indexed в функции)
  const work_days_norm = getWorkDaysNorm(year, month - 1)

  // Подсчёт по статусам
  let work_days = 0
  let remote_days = 0
  let vacation_days = 0
  let dayoff_days = 0
  let absent_days = 0
  let weekend_work_days = 0
  let total_hours = 0

  for (const entry of timesheet) {
    const entryDate = new Date(entry.work_date)
    const isWeekend = isWeekendOrHoliday(entryDate)
    const hours = roundTimesheetHours(entry.hours_worked)

    switch (entry.status) {
      case 'work':
      case 'sick_worked':
        total_hours += hours || getDailyHoursNorm(entryDate)
        if (isWeekend) {
          // Выходной засчитывается только если >= 3 часов
          if (hours >= 3) weekend_work_days++
        } else {
          work_days++
        }
        break
      case 'remote':
        const remoteHours = hours || getDailyHoursNorm(entryDate)
        if (isWeekend) {
          // Удалёнка в выходной тоже считается рабочим выходным (>= 3ч)
          if (remoteHours >= 3) weekend_work_days++
        } else {
          remote_days++
        }
        total_hours += remoteHours
        break
      case 'vacation':
      case 'educational_leave':
        vacation_days++
        break
      case 'dayoff':
        dayoff_days++
        break
      case 'absent':
      case 'unpaid':
      case 'sick':
        absent_days++
        break
    }
  }

  // Отработанные рабочие дни в будни = work (не выходные) + remote
  const work_days_actual = work_days + remote_days

  // Дневные ставки
  const dailyRate = work_days_norm > 0 ? base_salary / work_days_norm : 0
  const transportDailyRate = work_days_norm > 0 ? transport / work_days_norm : 0

  // Расчёты
  const work_payment = dailyRate * work_days_actual
  const weekend_payment = dailyRate * weekend_work_days  // доп. оплата за выходные
  // Проезд: максимум = базовая ставка, пропорционально отработанным дням
  const transport_payment = Math.min(transport, transportDailyRate * work_days_actual)

  // Расчётная ЗП (оклад за рабочие + доп. за выходные)
  const calculated_salary = Math.round((work_payment + weekend_payment) * 100) / 100

  // Итого
  const final_salary = Math.round((calculated_salary + transport_payment + bonus - deductions) * 100) / 100

  return {
    id: 0,
    employee_id,
    year,
    month,
    base_salary,
    work_days_norm,
    work_days_actual,
    work_hours_actual: Math.round(total_hours),
    remote_days,
    vacation_days,
    dayoff_days,
    absent_days,
    weekend_work_days,
    calculated_salary,
    bonus,
    deductions,
    final_salary,
    transport,
    transport_payment: Math.round(transport_payment * 100) / 100,
    weekend_payment: Math.round(weekend_payment * 100) / 100
  }
}

interface EmployeeWithCalc {
  employee: Employee
  calculation: SalaryCalculation
}

// Расчёт ФОТ по отделам
export function calculateDepartmentFOT(data: EmployeeWithCalc[]): DepartmentFOT[] {
  const byDepartment = new Map<string, SalaryCalculation[]>()

  for (const { employee, calculation } of data) {
    const dept = employee.department || 'Без отдела'
    const list = byDepartment.get(dept) || []
    list.push(calculation)
    byDepartment.set(dept, list)
  }

  const result: DepartmentFOT[] = []

  byDepartment.forEach((calculations, department) => {
    const total_base_salary = calculations.reduce((s, c) => s + c.base_salary, 0)
    const total_calculated_salary = calculations.reduce((s, c) => s + c.calculated_salary, 0)
    const total_bonus = calculations.reduce((s, c) => s + c.bonus, 0)
    const total_deductions = calculations.reduce((s, c) => s + c.deductions, 0)
    const total_final_salary = calculations.reduce((s, c) => s + c.final_salary, 0)
    const total_transport_payment = calculations.reduce((s, c) => s + c.transport_payment, 0)
    const total_weekend_payment = calculations.reduce((s, c) => s + c.weekend_payment, 0)

    result.push({
      department,
      employees_count: calculations.length,
      total_base_salary: Math.round(total_base_salary * 100) / 100,
      total_calculated_salary: Math.round(total_calculated_salary * 100) / 100,
      total_bonus: Math.round(total_bonus * 100) / 100,
      total_deductions: Math.round(total_deductions * 100) / 100,
      total_final_salary: Math.round(total_final_salary * 100) / 100,
      avg_salary: calculations.length > 0
        ? Math.round((total_final_salary / calculations.length) * 100) / 100
        : 0,
      total_transport_payment: Math.round(total_transport_payment * 100) / 100,
      total_weekend_payment: Math.round(total_weekend_payment * 100) / 100
    })
  })

  return result.sort((a, b) => b.total_final_salary - a.total_final_salary)
}

interface TimeDeviation {
  date: string
  expected_hours: number
  actual_hours: number
  deviation: number
  type: 'under' | 'over'
}

// Проверка отклонений от нормы времени
export function checkTimeDeviations(timesheet: TimesheetEntry[]): TimeDeviation[] {
  const deviations: TimeDeviation[] = []

  for (const entry of timesheet) {
    if (entry.status !== 'work' && entry.status !== 'remote' && entry.status !== 'sick_worked') continue

    const date = new Date(entry.work_date)
    const expected = getDailyHoursNorm(date)
    const actual = roundTimesheetHours(entry.hours_worked)
    const deviation = actual - expected

    // Порог отклонения: 0.5 часа
    if (Math.abs(deviation) >= 0.5) {
      deviations.push({
        date: entry.work_date,
        expected_hours: expected,
        actual_hours: actual,
        deviation,
        type: deviation < 0 ? 'under' : 'over'
      })
    }
  }

  return deviations
}

// Форматирование суммы в рубли
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
