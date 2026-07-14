import type { FotEmployeeEvent } from './fotEmployeeEvents'

export const FOT_DEFAULT_LUNCH_SECONDS = 60 * 60

export interface SkudWorkPair {
  entry: FotEmployeeEvent
  exit: FotEmployeeEvent | null
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  isOpen: boolean
}

export interface SkudOutsideBreak {
  afterExit: FotEmployeeEvent
  beforeEntry: FotEmployeeEvent
  durationSeconds: number
}

export interface SkudDayCalculation {
  events: FotEmployeeEvent[]
  pairs: SkudWorkPair[]
  breaks: SkudOutsideBreak[]
  firstEntry: FotEmployeeEvent | null
  lastExit: FotEmployeeEvent | null
  rawWorkSeconds: number
  outsideSeconds: number
  lunchDeductionSeconds: number
  paidSeconds: number
  ignoredEvents: number
  hasOpenPair: boolean
  rangeStartSeconds: number | null
  rangeEndSeconds: number | null
}

export function timeToSeconds(value: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = value.split(':').map(Number)
  return hours * 60 * 60 + minutes * 60 + seconds
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nowSeconds(date: Date): number {
  return date.getHours() * 60 * 60 + date.getMinutes() * 60 + date.getSeconds()
}

/**
 * Повторяет расчёт рабочего времени из FOT:
 * - учитываются только закрытые пары вход → выход;
 * - повторный вход на той же точке заменяет незакрытый вход;
 * - вход на другой точке не сбрасывает уже открытую пару;
 * - открытая сегодняшняя пара закрывается текущим временем;
 * - оплачиваемое время = сумма пар − остаток часовой обеденной квоты,
 *   который ещё не покрыт выходами с объекта.
 */
export function calculateFotSkudDay(
  sourceEvents: FotEmployeeEvent[],
  eventDate: string,
  now = new Date(),
  lunchQuotaSeconds = FOT_DEFAULT_LUNCH_SECONDS
): SkudDayCalculation {
  const events = [...sourceEvents].sort((left, right) => (
    left.event_time.localeCompare(right.event_time) || left.id.localeCompare(right.id)
  ))
  const pairs: SkudWorkPair[] = []
  const breaks: SkudOutsideBreak[] = []
  const usedEventIds = new Set<string>()

  let openEntry: FotEmployeeEvent | null = null
  let previousPairExit: FotEmployeeEvent | null = null

  for (const event of events) {
    if (event.direction === 'entry') {
      if (openEntry === null || event.access_point === openEntry.access_point) {
        openEntry = event
      }
      continue
    }

    if (event.direction !== 'exit' || openEntry === null) continue

    const startSeconds = timeToSeconds(openEntry.event_time)
    const endSeconds = timeToSeconds(event.event_time)
    if (endSeconds >= startSeconds) {
      pairs.push({
        entry: openEntry,
        exit: event,
        startSeconds,
        endSeconds,
        durationSeconds: endSeconds - startSeconds,
        isOpen: false
      })
      usedEventIds.add(openEntry.id)
      usedEventIds.add(event.id)

      if (previousPairExit) {
        const breakSeconds = Math.max(0, startSeconds - timeToSeconds(previousPairExit.event_time))
        if (breakSeconds > 0) {
          breaks.push({
            afterExit: previousPairExit,
            beforeEntry: openEntry,
            durationSeconds: breakSeconds
          })
        }
      }
      previousPairExit = event
    }

    openEntry = null
  }

  if (openEntry && eventDate === toLocalIsoDate(now)) {
    const startSeconds = timeToSeconds(openEntry.event_time)
    const endSeconds = nowSeconds(now)
    if (endSeconds > startSeconds) {
      pairs.push({
        entry: openEntry,
        exit: null,
        startSeconds,
        endSeconds,
        durationSeconds: endSeconds - startSeconds,
        isOpen: true
      })
      usedEventIds.add(openEntry.id)

      if (previousPairExit) {
        const breakSeconds = Math.max(0, startSeconds - timeToSeconds(previousPairExit.event_time))
        if (breakSeconds > 0) {
          breaks.push({
            afterExit: previousPairExit,
            beforeEntry: openEntry,
            durationSeconds: breakSeconds
          })
        }
      }
    }
  }

  const rawWorkSeconds = pairs.reduce((total, pair) => total + pair.durationSeconds, 0)
  const outsideSeconds = breaks.reduce((total, item) => total + item.durationSeconds, 0)
  const lunchDeductionSeconds = Math.max(0, lunchQuotaSeconds - outsideSeconds)
  const paidSeconds = Math.max(0, rawWorkSeconds - lunchDeductionSeconds)
  const firstEntry = events.find(event => event.direction === 'entry') || null
  const lastExit = [...events].reverse().find(event => event.direction === 'exit') || null
  const rangeStartSeconds = pairs.length > 0 ? Math.min(...pairs.map(pair => pair.startSeconds)) : null
  const rangeEndSeconds = pairs.length > 0 ? Math.max(...pairs.map(pair => pair.endSeconds)) : null

  return {
    events,
    pairs,
    breaks,
    firstEntry,
    lastExit,
    rawWorkSeconds,
    outsideSeconds,
    lunchDeductionSeconds,
    paidSeconds,
    ignoredEvents: events.filter(event => (
      (event.direction === 'entry' || event.direction === 'exit') && !usedEventIds.has(event.id)
    )).length,
    hasOpenPair: pairs.some(pair => pair.isOpen),
    rangeStartSeconds,
    rangeEndSeconds
  }
}

export function formatSkudDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours === 0 && minutes === 0) return `${remainingSeconds}с`
  if (hours === 0) return remainingSeconds === 0 ? `${minutes}м` : `${minutes}м ${remainingSeconds}с`
  if (minutes === 0 && remainingSeconds === 0) return `${hours}ч`
  if (remainingSeconds === 0) return `${hours}ч ${minutes}м`
  return `${hours}ч ${minutes}м ${remainingSeconds}с`
}
