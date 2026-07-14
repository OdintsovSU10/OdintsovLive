import type { TimesheetStatus } from '../types'
import { isWeekendOrHoliday, roundTimesheetHours } from './salaryCalculator'

/**
 * FOT API отдаёт нетто-часы после обеденной квоты. Для автоматического буднего
 * времени восстанавливаем один час обеда и только затем округляем как в FOT.
 * Явная ручная правка часов уже авторитетна и повторно не корректируется.
 */
export function normalizeFotHours(
  hours: number | null,
  status: TimesheetStatus,
  workDate: string,
  hoursOverridden: boolean
): number | null {
  if (hours == null) return null

  const date = new Date(`${workDate}T12:00:00`)
  const hasAutomaticLunch = !hoursOverridden
    && !isWeekendOrHoliday(date)
    && hours > 0
    && (status === 'work' || status === 'remote')

  return roundTimesheetHours(hours + (hasAutomaticLunch ? 1 : 0))
}
