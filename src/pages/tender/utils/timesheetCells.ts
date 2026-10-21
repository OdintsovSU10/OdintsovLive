import type { TimesheetEntry } from '../types'
import { getFullDayThresholdHours, resolveTimesheetWorkedHours } from './attendanceDay'
import { getDailyHoursNorm, isWeekendOrHoliday, roundTimesheetHours } from './salaryCalculator'
import { TIMESHEET_STATUS_META } from './timesheetStatus'

export interface ITimesheetCellVisual {
  // Текст в ячейке: часы или короткий код статуса
  label: string
  // Классы тона ячейки (заливка и цвет текста)
  className: string
  title: string
}

export interface ITimesheetEmployeeStats {
  workDays: number
  remoteDays: number
  vacationDays: number
  weekendDays: number
  totalHours: number
  overtimeHours: number
}

export const EMPTY_TIMESHEET_STATS: ITimesheetEmployeeStats = {
  workDays: 0,
  remoteDays: 0,
  vacationDays: 0,
  weekendDays: 0,
  totalHours: 0,
  overtimeHours: 0
}

export const DOW_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Легенда табеля: класс образца, подпись образца, описание
export const LEGEND_ITEMS: { chip: string; sample: string; label: string }[] = [
  { chip: 'ts-legend-weekend', sample: '', label: 'Выходные дни' },
  { chip: 'ts-tone-workday', sample: '8', label: 'Рабочие дни (будни)' },
  { chip: 'ts-tone-weekend', sample: '5', label: 'Работа в выходной (от 3 ч)' },
  { chip: 'ts-state-low', sample: '6', label: 'Неполный день (меньше нормы 8/7 ч)' },
  { chip: 'ts-state-critical', sample: '2', label: 'Меньше 3 ч' },
  { chip: 'ts-state-high', sample: '11', label: 'Больше 10 ч' },
  { chip: 'ts-status-vacation', sample: 'От', label: 'Отпуск' },
  { chip: 'ts-status-sick', sample: 'Б', label: 'Больничный' },
  { chip: 'ts-status-absent', sample: 'Н', label: 'Неявка' },
  { chip: 'ts-status-dayoff', sample: 'В', label: 'Выходной' },
  { chip: 'ts-status-remote', sample: 'УУ', label: 'Удалёнка' },
  { chip: 'ts-status-unpaid', sample: 'С', label: 'За свой счёт' },
  { chip: 'ts-status-educational', sample: 'У', label: 'Учебный отпуск' },
  { chip: 'ts-status-sick-worked', sample: 'РБ', label: 'Работа на больничном' }
]

// Меньше этого в выходной не оплачивается; меньше — критично и в будни
const MIN_PAID_HOURS = 3
const HIGH_LOAD_HOURS = 10

export const getDayDowMonday = (year: number, month: number, day: number): number => {
  const date = new Date(year, month - 1, day)
  return (date.getDay() + 6) % 7
}

export const isWeekendDay = (year: number, month: number, day: number): boolean => {
  return isWeekendOrHoliday(new Date(year, month - 1, day))
}

// День позже сегодняшнего: по нему ещё нечего показывать
export const isFutureDay = (year: number, month: number, day: number, today: Date): boolean => {
  const key = year * 10000 + month * 100 + day
  return key > today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
}

export const formatHours = (value: number): string => String(roundTimesheetHours(value))

export const buildWeeks = (year: number, month: number, daysInMonth: number): number[][] => {
  const weeks: number[][] = []
  let week: number[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day)
    if (getDayDowMonday(year, month, day) === 6 || day === daysInMonth) {
      weeks.push(week)
      week = []
    }
  }

  return weeks
}

export const buildTimesheetMap = (
  timesheet: TimesheetEntry[] | undefined,
  year: number,
  month: number
): Map<number, TimesheetEntry> => {
  const map = new Map<number, TimesheetEntry>()
  if (!timesheet) return map

  for (const entry of timesheet) {
    const date = new Date(`${entry.work_date}T12:00:00`)
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue
    map.set(date.getDate(), entry)
  }

  return map
}

// Норма часов месяца: сумма нетто-порогов (без обеда) по рабочим дням
export const getMonthNormHours = (year: number, month: number, days: number[]): number => (
  days.reduce((sum, day) => sum + (getFullDayThresholdHours(new Date(year, month - 1, day)) ?? 0), 0)
)

export const getMonthNormDays = (year: number, month: number, days: number[]): number => (
  days.reduce((sum, day) => (isWeekendDay(year, month, day) ? sum : sum + 1), 0)
)

const isWorkedStatus = (status: TimesheetEntry['status']): boolean => (
  status === 'work' || status === 'remote' || status === 'sick_worked'
)

// Часы дня в нетто-учёте табеля (в табеле лежат часы без обеда)
export const getWorkedHours = (entry: TimesheetEntry, date: Date): number => {
  if (!isWorkedStatus(entry.status)) return 0
  return resolveTimesheetWorkedHours(entry, date)
}

export const getEmployeeStats = (
  timesheetMap: Map<number, TimesheetEntry>,
  year: number,
  month: number,
  days: number[]
): ITimesheetEmployeeStats => {
  let workDays = 0
  let remoteDays = 0
  let vacationDays = 0
  let weekendDays = 0
  let totalHours = 0
  let overtimeHours = 0

  for (const day of days) {
    const entry = timesheetMap.get(day)
    if (!entry) continue

    const date = new Date(year, month - 1, day)
    const weekend = isWeekendOrHoliday(date)

    if (isWorkedStatus(entry.status)) {
      const hours = getWorkedHours(entry, date)
      totalHours += hours
      // Сверх нетто-порога дня; в выходной порога нет — считаем от суточной нормы, как раньше
      overtimeHours += Math.max(0, hours - (getFullDayThresholdHours(date) ?? getDailyHoursNorm(date)))

      if (entry.status === 'remote') {
        remoteDays += 1
      }

      if (entry.status === 'remote' || entry.status === 'sick_worked' || hours >= MIN_PAID_HOURS) {
        if (weekend) weekendDays += 1
        else workDays += 1
      }
      continue
    }

    if (entry.status === 'vacation' || entry.status === 'educational_leave') {
      vacationDays += 1
    }
  }

  return {
    workDays,
    remoteDays,
    vacationDays,
    weekendDays,
    totalHours: Math.round(totalHours),
    overtimeHours: Math.round(overtimeHours)
  }
}

export const getCellVisual = (
  entry: TimesheetEntry | undefined,
  date: Date
): ITimesheetCellVisual | null => {
  if (!entry) return null

  if (entry.status === 'work' || entry.status === 'remote') {
    const hours = getWorkedHours(entry, date)
    const threshold = getFullDayThresholdHours(date)
    const offDay = threshold === null
    const rawHours = roundTimesheetHours(entry.hours_worked, threshold ?? getDailyHoursNorm(date))
    const baseTone = entry.status === 'remote'
      ? 'ts-tone-remote'
      : (offDay ? 'ts-tone-weekend' : 'ts-tone-workday')

    let stateTone = 'ts-state-normal'
    let hint = ''
    if (offDay) {
      if (hours > 0 && hours < MIN_PAID_HOURS) {
        stateTone = 'ts-state-critical'
        hint = ' Меньше 3 ч в выходной не оплачивается.'
      } else if (hours > HIGH_LOAD_HOURS) {
        stateTone = 'ts-state-high'
      }
    } else if (hours < MIN_PAID_HOURS) {
      stateTone = 'ts-state-critical'
    } else if (hours > HIGH_LOAD_HOURS) {
      stateTone = 'ts-state-high'
    } else if (hours < threshold) {
      stateTone = 'ts-state-low'
    }

    const titlePrefix = entry.status === 'remote'
      ? TIMESHEET_STATUS_META.remote.label
      : TIMESHEET_STATUS_META.work.label
    const hasAdjustedHours = Math.abs(rawHours - hours) > 0.001
    const hoursText = hasAdjustedHours
      ? `Факт в табеле: ${formatHours(rawHours)} ч. Учтено в расчёте: ${formatHours(hours)} ч.`
      : `Отработано: ${formatHours(hours)} ч.`
    const normText = offDay ? '' : ` Норма дня: ${threshold} ч.`

    return {
      label: entry.status === 'remote' ? TIMESHEET_STATUS_META.remote.short : formatHours(hours),
      className: `${entry.status === 'remote' ? 'ts-day-status ' : ''}${baseTone} ${stateTone}`,
      title: `${titlePrefix}. ${hoursText}${normText}${hint}`
    }
  }

  if (entry.status === 'sick_worked') {
    const hours = getWorkedHours(entry, date)
    const meta = TIMESHEET_STATUS_META.sick_worked
    return {
      label: meta.short,
      className: `ts-day-status ts-status-${meta.className}`,
      title: `${meta.label}. Учтено: ${formatHours(hours)} ч.`
    }
  }

  const meta = TIMESHEET_STATUS_META[entry.status]
  return {
    label: meta.short,
    className: `ts-day-status ts-status-${meta.className}`,
    title: `${meta.label}. Отработано: 0 ч.`
  }
}
