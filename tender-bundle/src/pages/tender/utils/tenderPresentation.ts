import type { EmployeeWithStats, TenderEmployeeVM } from '../types'

export function getEmployeeShortName(employee: EmployeeWithStats): string {
  if (employee.last_name && employee.first_name) {
    const firstInitial = employee.first_name.charAt(0).toUpperCase()
    const middleInitial = employee.middle_name ? `${employee.middle_name.charAt(0).toUpperCase()}.` : ''
    return `${employee.last_name} ${firstInitial}.${middleInitial}`.trim()
  }
  return employee.full_name
}

export function getEmployeeInitials(employee: EmployeeWithStats): string {
  if (employee.first_name && employee.last_name) {
    return `${employee.last_name.charAt(0)}${employee.first_name.charAt(0)}`.toUpperCase()
  }

  if (employee.avatar) {
    return employee.avatar
  }

  const nameParts = employee.full_name.trim().split(' ')
  if (nameParts.length >= 2) {
    return `${nameParts[0].charAt(0)}${nameParts[1].charAt(0)}`.toUpperCase()
  }

  return employee.full_name.slice(0, 2).toUpperCase()
}

export function getEmployeeGroup(employee: EmployeeWithStats): string {
  return employee.subdivision || employee.department || 'Без подразделения'
}

function toStableDate(value: string): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getAgeFromBirthDate(birthDate: string | null | undefined): number | null {
  const birth = toStableDate(birthDate || '')
  if (!birth) return null

  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  const hasBirthdayPassed = monthDiff > 0 || (monthDiff === 0 && now.getDate() >= birth.getDate())

  if (!hasBirthdayPassed) {
    years -= 1
  }

  return years >= 0 ? years : null
}

export function formatAgeYears(age: number): string {
  const absAge = Math.abs(age)
  const mod100 = absAge % 100
  const mod10 = absAge % 10

  if (mod100 >= 11 && mod100 <= 14) {
    return `${age} лет`
  }
  if (mod10 === 1) {
    return `${age} год`
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${age} года`
  }
  return `${age} лет`
}

function getMonthsFromDate(date: Date): number {
  const now = new Date()
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth()))
}

function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getEmployeeTenureMonths(employee: EmployeeWithStats): number {
  const startDate = toStableDate(employee.hire_date)
  if (!startDate) return 0
  return getMonthsFromDate(startDate)
}

export function getMonthsSinceLastRaise(employee: EmployeeWithStats): number {
  const todayIsoDate = getTodayIsoDate()
  const salaryHistory = [...(employee.salaryHistory || [])]
    .filter(item => item.effective_date <= todayIsoDate)
    .sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))

  if (salaryHistory.length === 0) {
    const fallbackDate = toStableDate(employee.hire_date)
    return fallbackDate ? getMonthsFromDate(fallbackDate) : 0
  }

  let lastRaiseDate: Date | null = null
  for (let index = 1; index < salaryHistory.length; index++) {
    const previous = salaryHistory[index - 1]
    const current = salaryHistory[index]
    if (current.salary > previous.salary) {
      lastRaiseDate = toStableDate(current.effective_date)
    }
  }

  if (lastRaiseDate) {
    return getMonthsFromDate(lastRaiseDate)
  }

  const firstSalaryDate = toStableDate(salaryHistory[0].effective_date)
  if (firstSalaryDate) {
    return getMonthsFromDate(firstSalaryDate)
  }

  const fallbackDate = toStableDate(employee.hire_date)
  return fallbackDate ? getMonthsFromDate(fallbackDate) : 0
}

export function formatMonthsSinceRaise(months: number): string {
  if (months < 1) return '< 1 мес'
  if (months < 12) return `${months} мес`
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (remainingMonths === 0) return `${years} г`
  return `${years} г ${remainingMonths} м`
}

export function toTenderEmployeeVM(employee: EmployeeWithStats): TenderEmployeeVM {
  return {
    id: employee.id,
    fullName: employee.full_name,
    shortName: getEmployeeShortName(employee),
    initials: getEmployeeInitials(employee),
    role: employee.position,
    department: employee.department || 'Без отдела',
    group: getEmployeeGroup(employee),
    salary: employee.current_salary,
    noRaiseMonths: getMonthsSinceLastRaise(employee),
    avatar: employee.avatar
  }
}

export function mapEmployeesToTenderVM(employees: EmployeeWithStats[]): TenderEmployeeVM[] {
  return employees.map(toTenderEmployeeVM)
}

export function getPositionPriority(position: string | undefined): number {
  const positionLower = position?.toLowerCase() || ''
  if (positionLower.includes('руководитель')) return 0
  if (positionLower.includes('старший группы')) return 1
  return 2
}

export function getNoRaiseColor(months: number): string {
  if (months >= 9) return '#f87171'
  if (months >= 6) return '#fb923c'
  return '#22d3ee'
}

export function getDurationHighlightColor(months: number): string {
  if (months > 9) return '#f87171'
  if (months >= 6) return '#facc15'
  return '#34d399'
}

export function getWorkSummaryForMonth(
  employee: EmployeeWithStats,
  workDaysNorm: number
): {
  officeDays: number
  remoteDays: number
  weekendDays: number
  totalWorkedDays: number
  offDays: number
} {
  const officeDays = employee.attendance.work_weekday
  const remoteWeekdayDays = employee.attendance.remote_weekday
  const remoteDays = employee.attendance.remote
  const weekendDays = employee.attendance.weekend_work
  const totalWorkedDays = officeDays + remoteWeekdayDays
  const offDays = Math.max(0, workDaysNorm - totalWorkedDays)

  return {
    officeDays,
    remoteDays,
    weekendDays,
    totalWorkedDays,
    offDays
  }
}
