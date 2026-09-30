import { useMemo } from 'react'
import type { ExpenseType, FuelType, MaintenanceType } from '../types'
import { buildConsumptionIntervals } from '../utils/consumption'
import { buildJournalEntries } from '../utils/journal'

// Единый список записей и интервалы расхода — общие для «Обзора» и «Журнала»
export function useJournalEntries(maintenance: MaintenanceType[], fuel: FuelType[], expenses: ExpenseType[]) {
  const intervals = useMemo(() => buildConsumptionIntervals(fuel), [fuel])

  const entries = useMemo(() => {
    const consumptionByFuelId = new Map(intervals.map(item => [item.fuelId, item.l100]))
    return buildJournalEntries(maintenance, fuel, expenses, consumptionByFuelId)
  }, [maintenance, fuel, expenses, intervals])

  return { entries, intervals }
}
