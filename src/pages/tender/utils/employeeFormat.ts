export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

export const MONTH_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
]

// Подписи столбиков графика
export const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

// Короткая форма в дате: «14 мар»
export const MONTH_SHORT_GENITIVE = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
export const WEEKDAYS_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00`)
}

export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`
}

export function formatHoursValue(hours: number): string {
  return hours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

// «14 мар 2026»
export function formatShortDate(value: string, withYear = true): string {
  const date = parseIsoDate(value)
  const base = `${date.getDate()} ${MONTH_SHORT_GENITIVE[date.getMonth()]}`
  return withYear ? `${base} ${date.getFullYear()}` : base
}

// Индекс месяца для сравнений: год * 12 + месяц (1–12)
export function monthIndex(year: number, month: number): number {
  return year * 12 + month
}

// Первый доступный месяц сотрудника по дате найма; null — дата не разобрана
export function getHireMonthIndex(hireDate: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(hireDate || '')
  if (!match) return null
  return monthIndex(Number(match[1]), Number(match[2]))
}

export function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + offset, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
