import { PRESENCE_LABELS, type FirstEntryMap, type IEmployeeTrend, type PassesMap, type PresenceMap, type PresenceStatus } from './dashboardTypes'
import type { IMetricPerson, IMetricTag, MetricTone } from './metricPeople'
import { isLateArrival, toClock } from './todayMetrics'

// Показатели «сегодня»: те же множества людей, что считает buildTodaySummary
export type TodayMetricKind = 'today:present' | 'today:absent' | 'today:left' | 'today:late' | 'today:nomark'

export interface ITodayPeopleInput {
  statuses: PresenceMap
  passes: PassesMap
  firstEntries: FirstEntryMap
}

export const TODAY_METRIC_TITLES: Record<TodayMetricKind, string> = {
  'today:present': 'Присутствуют',
  'today:absent': 'Отсутствуют',
  'today:left': 'Вышли',
  'today:late': 'Опоздания',
  'today:nomark': 'Нет отметки'
}

export const isTodayKind = (kind: string): kind is TodayMetricKind => kind.startsWith('today:')

const ON_TIME_MINUTES = 9 * 60
// До 09:15 — небольшое опоздание (warn), позже — bad; как в карточке пунктуальности
const SLIGHTLY_LATE_MINUTES = 15

// Тон опоздания в минутах от 09:00
const getLatenessTone = (lateMinutes: number): MetricTone => (
  lateMinutes <= 0 ? 'ok' : lateMinutes <= SLIGHTLY_LATE_MINUTES ? 'warn' : 'bad'
)

const ABSENT_TONES: Partial<Record<PresenceStatus, MetricTone>> = {
  noMark: 'bad',
  notYet: 'warn',
  vacation: 'info',
  sick: 'info',
  remote: 'info',
  dayoff: 'muted'
}

// Порядок «отсутствующих»: нет отметки и не пришли — выше, уважительные причины — ниже
const ABSENT_ORDER: Partial<Record<PresenceStatus, number>> = { noMark: 0, notYet: 1, sick: 2, vacation: 3 }

const toMinutes = (clock: string): number => {
  const [hours, minutes] = toClock(clock).split(':').map(Number)
  return hours * 60 + minutes
}

const getLateMinutes = (clock: string): number => Math.max(0, toMinutes(clock) - ON_TIME_MINUTES)

const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} мин`
  const rest = minutes % 60
  return rest === 0 ? `${Math.floor(minutes / 60)} ч` : `${Math.floor(minutes / 60)} ч ${rest} мин`
}

const getLastExit = (passes: PassesMap, employeeId: number): string | null => {
  const list = passes.get(employeeId) ?? []
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].direction === 'exit') return list[index].time
  }
  return null
}

const formatLateness = (clock: string): string => formatMinutes(getLateMinutes(clock))

// Итог для строки «N сотрудников» у опозданий: среднее опоздание; значение строки — время прихода
export const getLateSummary = (people: IMetricPerson[]): string | null => {
  if (people.length === 0) return null
  const total = people.reduce((sum, person) => sum + getLateMinutes(person.value), 0)
  return `в среднем ${formatMinutes(Math.round(total / people.length))}`
}

// Строки мини-окна «сегодня»; счётчики совпадают с плитками и чипами шапки
export function buildTodayPeople(
  kind: TodayMetricKind,
  trends: IEmployeeTrend[],
  { statuses, passes, firstEntries }: ITodayPeopleInput
): IMetricPerson[] {
  const result: IMetricPerson[] = []

  for (const { employee, subdivision } of trends) {
    const base = { employee, subdivision }
    const status = statuses.get(employee.id)
    const firstEntry = firstEntries.get(employee.id)

    if (kind === 'today:present') {
      if (status !== 'office' && status !== 'remote') continue
      if (status === 'remote') {
        result.push({ ...base, value: 'удалённо', valueTone: 'info', sort: Number.MAX_SAFE_INTEGER })
      } else {
        result.push({
          ...base,
          value: firstEntry ? toClock(firstEntry) : '—',
          valueTone: firstEntry ? getLatenessTone(getLateMinutes(firstEntry)) : undefined,
          tags: [{ text: 'в офисе', tone: 'ok' }],
          sort: firstEntry ? toMinutes(firstEntry) : Number.MAX_SAFE_INTEGER - 1
        })
      }
    } else if (kind === 'today:absent') {
      if (status !== 'vacation' && status !== 'sick' && status !== 'noMark' && status !== 'notYet') continue
      result.push({
        ...base,
        value: PRESENCE_LABELS[status],
        valueTone: ABSENT_TONES[status],
        sort: ABSENT_ORDER[status] ?? 9
      })
    } else if (kind === 'today:left') {
      if (status !== 'left') continue
      const exit = getLastExit(passes, employee.id)
      result.push({
        ...base,
        value: exit ? toClock(exit) : '—',
        valueTone: 'muted',
        tags: firstEntry
          ? [{ text: `пришёл ${toClock(firstEntry)}`, tone: isLateArrival(firstEntry) ? 'warn' : 'muted' }]
          : undefined,
        sort: exit ? toMinutes(exit) : Number.MAX_SAFE_INTEGER
      })
    } else if (kind === 'today:late') {
      if (!firstEntry || !isLateArrival(firstEntry)) continue
      const tone = getLatenessTone(getLateMinutes(firstEntry))
      const tags: IMetricTag[] = [{ text: `опоздание ${formatLateness(firstEntry)}`, tone }]
      if (status === 'office') tags.push({ text: 'в офисе', tone: 'ok' })
      else if (status === 'left') tags.push({ text: 'ушёл', tone: 'muted' })
      else if (status) tags.push({ text: PRESENCE_LABELS[status].toLowerCase(), tone: 'muted' })
      result.push({
        ...base,
        value: toClock(firstEntry),
        valueTone: tone,
        tags,
        // Чем позже пришёл, тем выше
        sort: -toMinutes(firstEntry)
      })
    } else {
      if (status !== 'noMark') continue
      result.push({ ...base, value: 'нет прохода', valueTone: 'bad', sort: 0 })
    }
  }

  return result.sort((left, right) => (
    left.sort - right.sort || left.employee.full_name.localeCompare(right.employee.full_name, 'ru')
  ))
}
