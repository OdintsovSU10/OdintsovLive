import type { EmployeeWithStats, TimesheetStatus } from '../../types'

// Окно аналитики: выбранный месяц + столько же месяцев назад
export const MONTHS_WINDOW = 5

export const NO_SUBDIVISION = 'Без подразделения'

export interface IMonthSlot {
  year: number
  month: number
  key: string
  label: string
  short: string
}

export type StatusCounts = Record<TimesheetStatus, number>

export interface IEmployeeTrendPoint {
  hasTimesheet: boolean
  hours: number
  normHoursWeekdays: number
  normWorkdays: number
  // Отработанные будни (work + remote + sick_worked)
  workedWeekdays: number
  overtime: number
  weekendDays: number
  // Факт по табелю (как раньше: final_salary)
  earned: number
  // План месяца: оклад + бонус + проезд месяца
  plan: number
  statusCounts: StatusCounts
}

export interface IEmployeeTrend {
  employee: EmployeeWithStats
  subdivision: string
  points: IEmployeeTrendPoint[]
  latest: IEmployeeTrendPoint
  previous: IEmployeeTrendPoint | null
}

export type PresenceStatus =
  | 'office'
  | 'remote'
  | 'left'
  | 'vacation'
  | 'sick'
  | 'dayoff'
  | 'noMark'
  | 'notYet'
  | 'noData'

export const PRESENCE_ORDER: PresenceStatus[] = [
  'office',
  'remote',
  'left',
  'vacation',
  'sick',
  'dayoff',
  'noMark',
  'notYet',
  'noData'
]

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  office: 'В офисе',
  remote: 'Удалённо',
  left: 'Ушёл',
  vacation: 'Отпуск',
  sick: 'Больничный',
  dayoff: 'Выходной',
  noMark: 'Нет отметки',
  notYet: 'Ещё не пришёл',
  noData: 'Нет данных СКУД'
}

export type PresenceMap = ReadonlyMap<number, PresenceStatus>
