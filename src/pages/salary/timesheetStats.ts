import type { TimesheetStatus } from '../tender/types'
import { isWeekendOrHoliday, getDailyHoursNorm, roundTimesheetHours } from '../tender/utils/salaryCalculator'
import type { MonthStats } from './types'

export interface TimesheetDay {
  work_date: string
  status: TimesheetStatus
  hours_worked: number | null
}

// Строки calendar_days: 'work' | 'worked' | 'vacation'
export interface PlanDay {
  date: string
  status: string
}

export interface YearStats {
  stats: Record<string, MonthStats>
  // Сколько дней месяца посчитано по плану (прогноз), а не по табелю
  forecastDays: Record<string, number>
}

const pad = (n: number): string => String(n).padStart(2, '0')

// Дни года из табеля (прошлое) и личного плана календаря (будущее).
// Правила повторяют calculateSalary в tender/utils/salaryCalculator.ts
export const buildYearStats = (
  year: number,
  timesheet: TimesheetDay[],
  plan: PlanDay[],
  todayIso: string
): YearStats => {
  const stats: Record<string, MonthStats> = {}
  const forecastDays: Record<string, number> = {}
  for (let m = 0; m < 12; m++) {
    stats[`${year}-${m}`] = { work: 0, worked: 0, vacation: 0 }
    forecastDays[`${year}-${m}`] = 0
  }

  const timesheetByDate = new Map<string, TimesheetDay>()
  timesheet.forEach(row => timesheetByDate.set(row.work_date, row))
  const planByDate = new Map<string, string>()
  plan.forEach(row => planByDate.set(row.date, row.status))

  for (let m = 0; m < 12; m++) {
    const key = `${year}-${m}`
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, m, d)
      const dateIso = `${year}-${pad(m + 1)}-${pad(d)}`
      const isOff = isWeekendOrHoliday(date)
      const st = stats[key]

      const row = timesheetByDate.get(dateIso)
      if (row) {
        // Табель приоритетнее плана, в том числе для будущих дат
        switch (row.status) {
          case 'work':
          case 'sick_worked':
            if (isOff) {
              if (roundTimesheetHours(row.hours_worked) >= 3) st.worked++
            } else {
              st.work++
            }
            break
          case 'remote': {
            const hours = roundTimesheetHours(row.hours_worked) || getDailyHoursNorm(date)
            if (isOff) {
              if (hours >= 3) st.worked++
            } else {
              st.work++
            }
            break
          }
          case 'vacation':
          case 'educational_leave':
            st.vacation++
            break
          default:
            break
        }
        continue
      }

      // Прошедший день без записи в табеле не считается
      if (dateIso < todayIso) continue

      const planStatus = planByDate.get(dateIso)
      if (planStatus === 'vacation') {
        st.vacation++
        forecastDays[key]++
      } else if (!isOff) {
        st.work++
        forecastDays[key]++
      } else if (planStatus === 'work' || planStatus === 'worked') {
        st.worked++
        forecastDays[key]++
      }
    }
  }

  return { stats, forecastDays }
}
