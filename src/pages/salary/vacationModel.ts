// Модель отпускных: повторяет представление public.vacation_rate (скользящее окно из 12 месяцев с данными)

const VACATION_DAYS_IN_MONTH = 29.3
const WINDOW_ROWS = 12

export interface VacationMonthInput {
  year: number
  month: number // 0-11
  salary: number
  norm: number
  bonus: number
  transport: number
  work: number
  worked: number
  vacation: number
}

export interface VacationMonthResult {
  year: number
  month: number
  totalPayment: number
  workedDays: number
  vacationDays: number
  calendarDays: number
  adjustedDays: number
  dailyRate: number
}

// Вход в любом порядке, выход — по хронологии. Месяцы без данных во вход не передаются:
// окно считает строки (месяцы с данными), а не календарные месяцы
export const buildVacationRates = (months: VacationMonthInput[]): VacationMonthResult[] => {
  const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month)

  const rows = sorted.map(m => {
    const calendarDays = new Date(m.year, m.month + 1, 0).getDate()
    const workedDays = m.work + m.worked
    const totalPayment = m.norm === 0
      ? 0
      : (m.salary / m.norm) * workedDays + m.bonus + (m.transport / m.norm) * m.work
    const adjustedDays = m.vacation > 0
      ? (calendarDays === 0 ? 0 : VACATION_DAYS_IN_MONTH * (workedDays / calendarDays))
      : VACATION_DAYS_IN_MONTH
    return { year: m.year, month: m.month, totalPayment, workedDays, vacationDays: m.vacation, calendarDays, adjustedDays }
  })

  return rows.map((row, i) => {
    const window = rows.slice(Math.max(0, i - (WINDOW_ROWS - 1)), i + 1)
    const sumPayment = window.reduce((s, r) => s + r.totalPayment, 0)
    const sumDays = window.reduce((s, r) => s + r.adjustedDays, 0)
    return { ...row, dailyRate: sumDays === 0 ? 0 : sumPayment / sumDays }
  })
}
