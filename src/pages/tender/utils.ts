import { MONTHS_SHORT } from '../../lib/constants'
import { Employee, SalaryHistory, CalendarDay } from './types'

export const formatMoney = (amount: number): string => {
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽'
}

export const formatNumberInput = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export const formatMonthYear = (dateStr: string): string => {
  const date = new Date(dateStr)
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export const formatDaysSinceRaise = (totalDays: number): string => {
  const months = Math.floor(totalDays / 30)
  const days = totalDays % 30
  if (months === 0) return `${days} дн.`
  if (days === 0) return `${months} мес.`
  return `${months} мес. ${days} дн.`
}

export const getLastRaise = (
  employeeId: number,
  salaryHistory: { [key: number]: SalaryHistory[] }
): SalaryHistory | null => {
  const history = salaryHistory[employeeId]
  if (!history || history.length < 2) return null
  const today = new Date().toISOString().split('T')[0]
  const historicalRaises = history.filter((h, i) => i > 0 && h.effective_date < today)
  return historicalRaises.length > 0 ? historicalRaises[0] : null
}

export const getDaysSinceRaise = (
  employeeId: number,
  hireDate: string,
  salaryHistory: { [key: number]: SalaryHistory[] }
): number => {
  const lastRaise = getLastRaise(employeeId, salaryHistory)
  const date = lastRaise ? new Date(lastRaise.effective_date) : new Date(hireDate)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export const getRaiseDiff = (
  employeeId: number,
  index: number,
  salaryHistory: { [key: number]: SalaryHistory[] }
): number | null => {
  const history = salaryHistory[employeeId]
  if (!history || index >= history.length - 1) return null
  return history[index].salary - history[index + 1].salary
}

export const getTimeBetweenRaises = (
  employeeId: number,
  index: number,
  salaryHistory: { [key: number]: SalaryHistory[] }
): { text: string; overYear: boolean } | null => {
  const history = salaryHistory[employeeId]
  if (!history || index >= history.length - 1) return null
  const current = new Date(history[index].effective_date)
  const prev = new Date(history[index + 1].effective_date)
  const diffDays = Math.floor((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
  const months = Math.floor(diffDays / 30)
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  const overYear = diffDays >= 365
  let text = ''
  if (years > 0 && remainingMonths > 0) {
    text = `${years} г. ${remainingMonths} мес.`
  } else if (years > 0) {
    text = `${years} г.`
  } else if (months > 0) {
    text = `${months} мес.`
  } else {
    text = `${diffDays} дн.`
  }
  return { text, overYear }
}

export const getBirthdaysOnDay = (
  day: number,
  month: number,
  employees: Employee[]
): Employee[] => {
  return employees.filter(e => {
    if (!e.birth_date || e.is_archived) return false
    const bd = new Date(e.birth_date)
    return bd.getDate() === day && bd.getMonth() === month
  })
}

export const getCalendarDays = (
  calendarMonth: Date,
  employees: Employee[]
): CalendarDay[] => {
  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPadding = (firstDay.getDay() + 6) % 7
  const days: CalendarDay[] = []

  // Previous month padding
  const prevLastDay = new Date(year, month, 0).getDate()
  for (let i = startPadding - 1; i >= 0; i--) {
    days.push({ day: prevLastDay - i, isCurrentMonth: false, birthdays: [] })
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ day: d, isCurrentMonth: true, birthdays: getBirthdaysOnDay(d, month, employees) })
  }

  // Next month padding
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, isCurrentMonth: false, birthdays: [] })
  }

  return days
}

export const isSeniorPosition = (position: string): boolean => {
  const lower = position.toLowerCase()
  return lower.includes('старший') || lower.includes('ведущий')
}

export const filterEmployees = (
  employees: Employee[],
  filterGroups: string[],
  filterPositions: string[],
  searchQuery: string
): Employee[] => {
  return employees.filter(emp => {
    if (filterGroups.length > 0 && !filterGroups.includes(emp.group_name || '')) return false
    if (filterPositions.length > 0 && !filterPositions.includes(emp.position)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!emp.full_name.toLowerCase().includes(q) && !emp.position.toLowerCase().includes(q)) return false
    }
    return true
  })
}
