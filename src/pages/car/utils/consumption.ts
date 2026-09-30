import { MAX_FUEL_INTERVAL_KM } from '../constants'
import type { DateRange, FuelType } from '../types'
import { isInRange, isoToTime } from './dates'

export interface ConsumptionInterval {
  fuelId: string
  date: string
  time: number
  km: number
  liters: number
  l100: number
  outlier: boolean
}

const OUTLIER_HIGH = 1.6
const OUTLIER_LOW = 0.6

// Метод полного бака: заправка i доливает то, что сожжено с заправки i-1.
// Литры первой заправки в расчёт не входят — неизвестно, с какого уровня она начиналась.
export function buildConsumptionIntervals(fuel: FuelType[]): ConsumptionInterval[] {
  const fills = fuel
    .filter(row => row.mileage !== null && row.mileage > 0 && row.liters !== null && row.liters > 0)
    .sort((a, b) => (a.mileage as number) - (b.mileage as number) || a.date.localeCompare(b.date))

  const intervals: ConsumptionInterval[] = []
  for (let i = 1; i < fills.length; i++) {
    const km = (fills[i].mileage as number) - (fills[i - 1].mileage as number)
    if (km <= 0 || km > MAX_FUEL_INTERVAL_KM) continue
    const liters = fills[i].liters as number
    intervals.push({
      fuelId: fills[i].id,
      date: fills[i].date,
      time: isoToTime(fills[i].date),
      km,
      liters,
      l100: liters / km * 100,
      outlier: false
    })
  }

  // Выброс — сильно дальше медианы: частичная заправка или опечатка в пробеге
  const sorted = intervals.map(item => item.l100).sort((a, b) => a - b)
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
  return intervals
    .map(item => ({
      ...item,
      outlier: sorted.length >= 3 && (item.l100 > median * OUTLIER_HIGH || item.l100 < median * OUTLIER_LOW)
    }))
    .sort((a, b) => a.time - b.time)
}

// Средний расход — Σлитров / Σкм, а не среднее от средних: частичные заправки взаимно гасятся
export function averageConsumption(intervals: ConsumptionInterval[], range?: DateRange): number | null {
  const scoped = range ? intervals.filter(item => isInRange(item.date, range)) : intervals
  const km = scoped.reduce((acc, item) => acc + item.km, 0)
  const liters = scoped.reduce((acc, item) => acc + item.liters, 0)
  return km > 0 ? liters / km * 100 : null
}

// Расход для новой заправки до сохранения: от ближайшей предыдущей по пробегу
export function consumptionForFill(
  fuel: FuelType[],
  mileage: number | null,
  liters: number | null,
  excludeId?: string
): number | null {
  if (!mileage || !liters) return null
  const previous = fuel
    .filter(row => row.id !== excludeId && row.mileage !== null && row.mileage < mileage)
    .reduce<number | null>((max, row) => Math.max(max ?? 0, row.mileage as number), null)
  if (previous === null) return null
  const km = mileage - previous
  if (km <= 0 || km > MAX_FUEL_INTERVAL_KM) return null
  return liters / km * 100
}
