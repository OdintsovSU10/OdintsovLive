import type { CarType, DateRange, FuelType, MaintenanceType } from '../types'
import { isoToTime, parseIsoDate, toIsoDate } from './dates'

export interface MileagePoint {
  time: number
  mileage: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Опорные точки пробега: покупка, записи с пробегом, текущий пробег на сегодня.
// Пробег не убывает: точки меньше уже достигнутого — опечатки, пропускаем.
export function buildMileagePoints(
  car: CarType,
  maintenance: MaintenanceType[],
  fuel: FuelType[],
  today = new Date()
): MileagePoint[] {
  const raw: MileagePoint[] = [
    { time: isoToTime(car.purchase_date), mileage: car.purchase_mileage },
    ...[...maintenance, ...fuel]
      .filter(row => row.mileage !== null && row.mileage > 0)
      .map(row => ({ time: isoToTime(row.date), mileage: row.mileage as number })),
    { time: parseIsoDate(toIsoDate(today)).getTime(), mileage: car.current_mileage }
  ].sort((a, b) => a.time - b.time || a.mileage - b.mileage)

  const points: MileagePoint[] = []
  for (const point of raw) {
    const last = points[points.length - 1]
    if (last && point.mileage < last.mileage) continue
    if (last && point.time === last.time) {
      points[points.length - 1] = point
    } else {
      points.push(point)
    }
  }
  return points
}

// Пробег на момент времени: линейная интерполяция между опорными точками
export function mileageAt(points: MileagePoint[], time: number): number {
  if (points.length === 0) return 0
  if (time <= points[0].time) return points[0].mileage
  const last = points[points.length - 1]
  if (time >= last.time) return last.mileage

  const index = points.findIndex(point => point.time >= time)
  const right = points[index]
  const left = points[index - 1]
  const share = (time - left.time) / (right.time - left.time)
  return left.mileage + (right.mileage - left.mileage) * share
}

// Километры за диапазон дат (с начала первого дня до конца последнего)
export function kmInRange(points: MileagePoint[], range: DateRange): number {
  const start = isoToTime(range.from)
  const end = isoToTime(range.to) + DAY_MS
  return Math.max(0, mileageAt(points, end) - mileageAt(points, start))
}

// Точки для графика: внутри диапазона плюс интерполированные края
export function mileagePointsInRange(points: MileagePoint[], range: DateRange): MileagePoint[] {
  const start = isoToTime(range.from)
  const end = isoToTime(range.to)
  const inner = points.filter(point => point.time > start && point.time < end)
  return [
    { time: start, mileage: Math.round(mileageAt(points, start)) },
    ...inner,
    { time: end, mileage: Math.round(mileageAt(points, end)) }
  ]
}
