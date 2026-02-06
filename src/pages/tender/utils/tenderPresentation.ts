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

export function getMonthsSinceLastRaise(employee: EmployeeWithStats): number {
  const salaryChanges = employee.history.filter(item => item.type === 'salary_change')
  const lastChange = salaryChanges.length > 0
    ? salaryChanges[salaryChanges.length - 1]
    : employee.history.find(item => item.type === 'hire')

  if (!lastChange) return 0

  const lastDate = new Date(lastChange.date)
  const now = new Date()
  return (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth())
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
  return '#94a3b8'
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
  const remoteDays = employee.attendance.remote_weekday
  const weekendDays = employee.attendance.weekend_work
  const totalWorkedDays = officeDays + remoteDays
  const offDays = Math.max(0, workDaysNorm - totalWorkedDays)

  return {
    officeDays,
    remoteDays,
    weekendDays,
    totalWorkedDays,
    offDays
  }
}

