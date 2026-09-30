import { HOLIDAYS } from './constants'

export function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() === month
}

export function isFutureMonth(year: number, month: number): boolean {
  const now = new Date()
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth())
}

export function isToday(year: number, month: number, day: number): boolean {
  const today = new Date()
  return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
}

export function isWeekend(year: number, month: number, day: number): boolean {
  const date = new Date(year, month, day)
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

export function isHoliday(month: number, day: number): boolean {
  return HOLIDAYS[month]?.includes(day) ?? false
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

export function formatDate(date: string | Date, format: 'short' | 'full' = 'full'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (format === 'short') {
    return d.toLocaleDateString('ru-RU')
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function calcAge(year: number, month?: number | null): string {
  const now = new Date()
  const purchaseDate = new Date(year, month ?? 0)
  const diffMs = now.getTime() - purchaseDate.getTime()
  const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25))
  const diffMonths = Math.floor((diffMs % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * 30.44))

  if (diffYears === 0) {
    return `${diffMonths} мес.`
  }
  if (diffMonths === 0) {
    return `${diffYears} ${diffYears === 1 ? 'год' : diffYears < 5 ? 'года' : 'лет'}`
  }
  return `${diffYears} ${diffYears === 1 ? 'год' : diffYears < 5 ? 'года' : 'лет'} ${diffMonths} мес.`
}

export function calcTenure(hireDate: string): string {
  const hire = new Date(hireDate)
  const now = new Date()
  const diffMs = now.getTime() - hire.getTime()
  const years = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25))
  const months = Math.floor((diffMs % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * 30.44))

  if (years === 0) {
    return `${months} мес.`
  }
  if (months === 0) {
    return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`
  }
  return `${years} г. ${months} мес.`
}
