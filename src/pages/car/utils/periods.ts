import type { DateRange, PeriodPreset } from '../types'
import { addDays, daysInRange, startOfMonthShifted, toIsoDate } from './dates'

export interface PeriodRanges {
  current: DateRange
  previous: DateRange | null
  days: number
  label: string
}

const PRESETS: Record<Exclude<PeriodPreset, 'all'>, { monthsBack: number; label: string }> = {
  '3m': { monthsBack: 2, label: 'за 3 месяца' },
  '6m': { monthsBack: 5, label: 'за 6 месяцев' },
  year: { monthsBack: 11, label: 'за 12 месяцев' }
}

// Текущий период — целые месяцы до сегодняшнего дня; прошлый — столько же дней перед ним.
// startIso — начало истории авто: раньше него периоды не заходят.
export function getPeriodRanges(preset: PeriodPreset, startIso: string, today = new Date()): PeriodRanges {
  const to = toIsoDate(today)

  if (preset === 'all') {
    const current = { from: startIso <= to ? startIso : to, to }
    return { current, previous: null, days: daysInRange(current), label: 'за всё время' }
  }

  const { monthsBack, label } = PRESETS[preset]
  const from = startOfMonthShifted(today, monthsBack)
  const current = { from: from < startIso ? startIso : from, to }
  const days = daysInRange(current)

  // Неполный прошлый период (авто ещё не было) сравнивать нечестно — без сравнения
  const previousTo = addDays(current.from, -1)
  const previousFrom = addDays(previousTo, -(days - 1))
  const previous = previousFrom < startIso ? null : { from: previousFrom, to: previousTo }

  return { current, previous, days, label }
}
