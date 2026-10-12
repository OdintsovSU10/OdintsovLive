import { ENGINE_OIL_KEY, SERVICE_INTERVAL_KM, SERVICE_INTERVAL_MONTHS } from '../constants'
import type { MaintenanceType, ServiceUnitType } from '../types'
import { parseIsoDate } from './dates'

export interface ServiceDue {
  title: string
  date: string
  kmSince: number | null
  monthsSince: number
  kmLeft: number | null
  monthsLeft: number
  progress: number
}

// Пробег агрегата от последней замены; дата есть, только если замена взята из журнала
export interface UnitCounter {
  unit: ServiceUnitType
  replacedAt: number | null
  date: string | null
  kmSince: number | null
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()
    - (to.getDate() < from.getDate() ? 1 : 0)
}

// Плановое ТО: что наступит раньше — пробег или срок от последней замены масла двигателя.
// Покупки и работы без отметки о замене счётчик не сбрасывают
export function getServiceDue(maintenance: MaintenanceType[], currentMileage: number, today = new Date()): ServiceDue | null {
  const last = maintenance
    .filter(row => row.resets.includes(ENGINE_OIL_KEY))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.mileage ?? 0) - (a.mileage ?? 0))[0]
  if (!last) return null

  const monthsSince = Math.max(0, monthsBetween(parseIsoDate(last.date), today))
  const kmSince = last.mileage ? Math.max(0, currentMileage - last.mileage) : null
  const progress = Math.max(
    monthsSince / SERVICE_INTERVAL_MONTHS,
    kmSince !== null ? kmSince / SERVICE_INTERVAL_KM : 0
  )

  return {
    title: last.type,
    date: last.date,
    kmSince,
    monthsSince,
    kmLeft: kmSince !== null ? SERVICE_INTERVAL_KM - kmSince : null,
    monthsLeft: SERVICE_INTERVAL_MONTHS - monthsSince,
    progress
  }
}

// Накопительные счётчики: от пробега замены, заданного вручную, или от более поздней записи с отметкой
export function getUnitCounters(units: ServiceUnitType[], maintenance: MaintenanceType[], currentMileage: number): UnitCounter[] {
  return units.map(unit => {
    let replacedAt = unit.replaced_mileage
    let date: string | null = null
    for (const row of maintenance) {
      if (!row.mileage || !row.resets.includes(unit.id)) continue
      if (replacedAt === null || row.mileage >= replacedAt) {
        replacedAt = row.mileage
        date = row.date
      }
    }
    return {
      unit,
      replacedAt,
      date,
      kmSince: replacedAt !== null ? Math.max(0, currentMileage - replacedAt) : null
    }
  })
}
