import type { DateRange, FuelType } from '../types'
import { isInRange, isoToTime } from './dates'

export type FuelPricePoint = { time: number } & Record<string, number>

// Цена литра по типам топлива: серия на каждый тип из данных, без жёсткого списка
export function buildFuelPrices(fuel: FuelType[], range: DateRange): { types: string[]; points: FuelPricePoint[] } {
  const rows = fuel
    .filter(row => row.price_per_liter && isInRange(row.date, range))
    .sort((a, b) => a.date.localeCompare(b.date))

  const types = Array.from(new Set(rows.map(row => row.fuel_type)))
  const points = rows.map(row => ({ time: isoToTime(row.date), [row.fuel_type]: Number(row.price_per_liter) }) as FuelPricePoint)
  return { types, points }
}
