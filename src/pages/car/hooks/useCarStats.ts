import { useMemo } from 'react'
import type { CarType, FuelType, JournalEntry, MaintenanceType, PeriodPreset } from '../types'
import { buildBreakdown, buildCostBuckets, sumInRange } from '../utils/buckets'
import { averageConsumption } from '../utils/consumption'
import type { ConsumptionInterval } from '../utils/consumption'
import { isInRange } from '../utils/dates'
import { buildFuelPrices } from '../utils/fuelPrices'
import { buildMileagePoints, kmInRange, mileagePointsInRange } from '../utils/mileage'
import { getPeriodRanges } from '../utils/periods'
import { getServiceDue } from '../utils/serviceDue'

const DAYS_IN_MONTH = 30.44

export interface CarKpi {
  spent: number
  prevSpent: number | null
  perKm: number | null
  prevPerKm: number | null
  l100: number | null
  prevL100: number | null
  km: number
  kmPerMonth: number
}

interface Params {
  car: CarType | null
  entries: JournalEntry[]
  maintenance: MaintenanceType[]
  fuel: FuelType[]
  intervals: ConsumptionInterval[]
  period: PeriodPreset
}

export function useCarStats({ car, entries, maintenance, fuel, intervals, period }: Params) {
  return useMemo(() => {
    if (!car) return null

    // История начинается с покупки или с самой ранней записи, если она старше
    const startIso = entries.reduce((min, entry) => (entry.date < min ? entry.date.slice(0, 10) : min), car.purchase_date)
    const ranges = getPeriodRanges(period, startIso)
    const { current, previous } = ranges

    const points = buildMileagePoints(car, maintenance, fuel)
    const km = kmInRange(points, current)
    const prevKm = previous ? kmInRange(points, previous) : 0
    const spent = sumInRange(entries, current)
    const prevSpent = previous ? sumInRange(entries, previous) : null

    const kpi: CarKpi = {
      spent,
      prevSpent,
      perKm: km > 0 ? spent / km : null,
      prevPerKm: prevSpent !== null && prevKm > 0 ? prevSpent / prevKm : null,
      l100: averageConsumption(intervals, current),
      prevL100: previous ? averageConsumption(intervals, previous) : null,
      km,
      kmPerMonth: km / (ranges.days / DAYS_IN_MONTH)
    }

    return {
      ranges,
      kpi,
      buckets: buildCostBuckets(entries, current),
      breakdown: buildBreakdown(entries, current, previous),
      consumption: intervals.filter(item => isInRange(item.date, current)),
      fuelPrices: buildFuelPrices(fuel, current),
      mileage: mileagePointsInRange(points, current),
      serviceDue: getServiceDue(maintenance, car.current_mileage)
    }
  }, [car, entries, maintenance, fuel, intervals, period])
}

export type CarStats = NonNullable<ReturnType<typeof useCarStats>>
