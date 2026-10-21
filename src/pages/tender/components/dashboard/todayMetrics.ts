import { countAccounted, countPresence, getOvertimeTone, getPercentTone, type IScopeSummary, type PresenceCounts, type Tone } from './dashboardMetrics'
import type { FirstEntryMap, IEmployeeTrend, PassesMap, PresenceMap } from './dashboardTypes'

// Пороги прихода по первому входу (сравнение по HH:MM, как в ФОТ)
const ON_TIME_UNTIL = '09:00'
const SLIGHTLY_LATE_UNTIL = '09:15'

export const toClock = (time: string): string => time.slice(0, 5)

export const isLateArrival = (time: string): boolean => toClock(time) > ON_TIME_UNTIL

export interface IPunctuality {
  onTime: number
  slightlyLate: number
  veryLate: number
  absent: number
  total: number
}

export interface ITodaySummary {
  counts: PresenceCounts
  // Сотрудники, учитываемые в посещаемости (без исключённых из табеля)
  accounted: number
  // Сейчас на объекте: в офисе и удалённо
  present: number
  // Были и ушли
  left: number
  // Не на месте без уважительной причины и не выходной: отпуск, больничный, нет отметки, ещё не пришли
  absent: number
  late: number
  noMark: number
  entries: number
  exits: number
  punctuality: IPunctuality
}

interface ITodayInput {
  statuses: PresenceMap
  passes: PassesMap
  firstEntries: FirstEntryMap
}

// Сводка «сегодня» по сотрудникам области
export function buildTodaySummary(trends: IEmployeeTrend[], { statuses, passes, firstEntries }: ITodayInput): ITodaySummary {
  const counts = countPresence(trends, statuses)
  const punctuality: IPunctuality = { onTime: 0, slightlyLate: 0, veryLate: 0, absent: 0, total: 0 }
  let late = 0
  let entries = 0
  let exits = 0

  for (const { employee } of trends) {
    for (const pass of passes.get(employee.id) ?? []) {
      if (pass.direction === 'entry') entries += 1
      else exits += 1
    }

    const firstEntry = firstEntries.get(employee.id)
    if (firstEntry && isLateArrival(firstEntry)) late += 1

    // В пунктуальность идут те, чей приход отражает СКУД; удалённые, отпуск и выходные не считаем
    const status = statuses.get(employee.id)
    if (status !== 'office' && status !== 'left' && status !== 'noMark' && status !== 'notYet') continue
    punctuality.total += 1
    if (!firstEntry) punctuality.absent += 1
    else if (toClock(firstEntry) <= ON_TIME_UNTIL) punctuality.onTime += 1
    else if (toClock(firstEntry) <= SLIGHTLY_LATE_UNTIL) punctuality.slightlyLate += 1
    else punctuality.veryLate += 1
  }

  return {
    counts,
    accounted: countAccounted(trends),
    present: counts.office + counts.remote,
    left: counts.left,
    absent: counts.vacation + counts.sick + counts.noMark + counts.notYet,
    late,
    noMark: counts.noMark,
    entries,
    exits,
    punctuality
  }
}

export interface IMonthStats {
  // null — нет табелей, считать нечего
  attendancePercent: number | null
  attendanceTone: Tone | null
  missedDays: number
  overtime: number
  overtimeTone: Tone | null
  // Сотрудники с пропущенными днями в табеле
  unfilledEmployees: number
}

// Месячные показатели области. В текущем месяце норма берётся на прошедшую долю месяца
export function buildMonthStats(
  summary: IScopeSummary,
  isLive: boolean,
  progress: number,
  unfilledEmployees: number
): IMonthStats {
  const expectedDays = isLive ? summary.normDays * progress : summary.normDays
  const attendancePercent = expectedDays > 0
    ? Math.min(100, (summary.workedDays / expectedDays) * 100)
    : null

  return {
    attendancePercent,
    attendanceTone: attendancePercent === null ? null : getPercentTone(attendancePercent),
    missedDays: summary.missedDays,
    overtime: summary.overtime,
    overtimeTone: getOvertimeTone(summary.overtime, summary.previousOvertime),
    unfilledEmployees
  }
}
