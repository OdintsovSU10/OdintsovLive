import type { CarType, MaintenanceType, FuelType, ExpenseType, SortBy } from './types'

export const formatPrice = (price: number | null) => {
  if (!price) return '—'
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₽'
}

export const formatMileage = (km: number) => {
  return new Intl.NumberFormat('ru-RU').format(km) + ' км'
}

export const sortItems = <T extends { date: string; cost?: number | null; total_cost?: number | null }>(
  items: T[],
  sortBy: SortBy
): T[] => {
  return [...items].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    }
    const costA = a.cost ?? a.total_cost ?? 0
    const costB = b.cost ?? b.total_cost ?? 0
    return costB - costA
  })
}

export const getExpensesChartData = (
  selectedCar: CarType | null,
  maintenance: MaintenanceType[],
  fuel: FuelType[],
  expenses: ExpenseType[]
) => {
  if (!selectedCar) return []
  const allRecords = [
    ...maintenance.map(m => ({ date: m.date, cost: m.cost || 0 })),
    ...fuel.map(f => ({ date: f.date, cost: f.total_cost || 0 })),
    ...expenses.map(e => ({ date: e.date, cost: e.cost || 0 }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let runningTotal = selectedCar.purchase_price || 0
  const data = [{ date: selectedCar.purchase_date, total: runningTotal, label: 'Покупка' }]

  allRecords.forEach(r => {
    runningTotal += r.cost
    data.push({ date: r.date, total: runningTotal, label: new Date(r.date).toLocaleDateString('ru-RU') })
  })
  return data
}

export const getMileageChartData = (
  selectedCar: CarType | null,
  maintenance: MaintenanceType[],
  fuel: FuelType[]
) => {
  if (!selectedCar) return []
  const allRecords = [
    ...maintenance.filter(m => m.mileage).map(m => ({ date: m.date, mileage: m.mileage! })),
    ...fuel.filter(f => f.mileage).map(f => ({ date: f.date, mileage: f.mileage! }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const data: { date: string; mileage: number; label: string }[] = [{
    date: selectedCar.purchase_date,
    mileage: selectedCar.purchase_mileage,
    label: 'Покупка'
  }]

  allRecords.forEach(r => {
    data.push({
      date: r.date,
      mileage: r.mileage,
      label: new Date(r.date).toLocaleDateString('ru-RU')
    })
  })

  const lastRecord = data[data.length - 1]
  if (selectedCar.current_mileage >= selectedCar.purchase_mileage &&
      (lastRecord.label === 'Покупка' || selectedCar.current_mileage !== lastRecord.mileage)) {
    data.push({
      date: new Date().toISOString().split('T')[0],
      mileage: selectedCar.current_mileage,
      label: 'Сейчас'
    })
  }

  return data
}

export const getFuelPriceChartData = (selectedCar: CarType | null, fuel: FuelType[]) => {
  if (!selectedCar || fuel.length === 0) return []
  return fuel
    .filter(f => f.price_per_liter)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(f => ({
      date: f.date,
      label: new Date(f.date).toLocaleDateString('ru-RU'),
      ai95: f.fuel_type === 'АИ-95' ? f.price_per_liter : null,
      ai100: f.fuel_type === 'АИ-100' ? f.price_per_liter : null
    }))
}

export const calculateTotals = (
  selectedCar: CarType | null,
  maintenance: MaintenanceType[],
  fuel: FuelType[],
  expenses: ExpenseType[]
) => {
  const maintenanceTotal = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0)
  const fuelTotal = fuel.reduce((sum, f) => sum + (f.total_cost || 0), 0)
  const totalLiters = fuel.reduce((sum, f) => sum + (f.liters || 0), 0)
  const expensesTotal = expenses.reduce((sum, e) => sum + (e.cost || 0), 0)
  const allExpensesTotal = maintenanceTotal + fuelTotal + expensesTotal
  const totalCarCost = (selectedCar?.purchase_price || 0) + allExpensesTotal

  const fuelMileages = fuel.filter(f => f.mileage).map(f => f.mileage!)
  const maxFuelMileage = fuelMileages.length > 0 ? Math.max(...fuelMileages) : 0
  const totalFuelKm = selectedCar && maxFuelMileage > 0
    ? maxFuelMileage - selectedCar.purchase_mileage
    : 0
  const avgConsumption = totalLiters > 0 && totalFuelKm > 0
    ? (totalLiters / totalFuelKm * 100).toFixed(1)
    : null

  return {
    maintenanceTotal,
    fuelTotal,
    totalLiters,
    expensesTotal,
    allExpensesTotal,
    totalCarCost,
    totalFuelKm,
    avgConsumption
  }
}
