// Норма рабочих дней по месяцам (производственный календарь)
// Источник: consultant.ru

export const WORK_DAYS_NORM: Record<number, number[]> = {
  // 2025 год
  2025: [17, 19, 20, 22, 18, 19, 23, 21, 22, 23, 19, 22],
  // 2026 год
  2026: [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22],
}

export function getWorkDaysNorm(year: number, month: number): number {
  const yearNorms = WORK_DAYS_NORM[year]
  if (yearNorms && month >= 0 && month < 12) {
    return yearNorms[month]
  }
  return 22 // дефолт
}
