import { SERVICE_INTERVAL_KM, SERVICE_INTERVAL_MONTHS } from '../constants'
import type { MaintenanceType } from '../types'
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

// «ТО», «ТО-2», «Плановое ТО», «Замена масла» — \b в JS не работает с кириллицей
const SERVICE_PATTERN = /(^|[^а-яё])то([^а-яё]|$)|масл/i

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()
    - (to.getDate() < from.getDate() ? 1 : 0)
}

// Плановое ТО: что наступит раньше — пробег или срок от последнего ТО
export function getServiceDue(maintenance: MaintenanceType[], currentMileage: number, today = new Date()): ServiceDue | null {
  const last = maintenance
    .filter(row => SERVICE_PATTERN.test(row.type))
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
