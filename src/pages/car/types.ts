export interface CarType {
  id: string
  brand: string
  model: string
  manufacture_month: number | null
  manufacture_year: number
  purchase_date: string
  purchase_mileage: number
  current_mileage: number
  purchase_price: number | null
  vin: string | null
  is_active: boolean
}

export interface MaintenanceType {
  id: string
  car_id: string
  date: string
  mileage: number | null
  type: string
  description: string | null
  cost: number | null
}

export interface FuelType {
  id: string
  car_id: string
  date: string
  mileage: number | null
  liters: number | null
  price_per_liter: number | null
  total_cost: number | null
  fuel_type: string
}

export interface ExpenseType {
  id: string
  car_id: string
  date: string
  category: string
  description: string | null
  cost: number
}

export interface PartType {
  id: string
  car_id: string
  category: string
  name: string
  part_number: string
  notes: string | null
}

export type CarTab = 'overview' | 'journal' | 'data'
export type RecordKind = 'maintenance' | 'fuel' | 'expense'
export type PeriodPreset = '3m' | '6m' | 'year' | 'all'
export type SortField = 'date' | 'amount'
export type SortDir = 'desc' | 'asc'

export type CarRecord =
  | { kind: 'maintenance'; row: MaintenanceType }
  | { kind: 'fuel'; row: FuelType }
  | { kind: 'expense'; row: ExpenseType }

export type RecordPayload =
  | { kind: 'maintenance'; data: Omit<MaintenanceType, 'id' | 'car_id'> }
  | { kind: 'fuel'; data: Omit<FuelType, 'id' | 'car_id'> }
  | { kind: 'expense'; data: Omit<ExpenseType, 'id' | 'car_id'> }

// Включительный диапазон дат в формате YYYY-MM-DD
export interface DateRange {
  from: string
  to: string
}

// Единая запись журнала: ТО, заправка или доп. расход
export interface JournalEntry {
  id: string
  kind: RecordKind
  date: string
  mileage: number | null
  title: string
  details: string | null
  amount: number
  groupKey: string
  record: CarRecord
}

export interface JournalFilter {
  kind: RecordKind | 'all'
  range: (DateRange & { label: string }) | null
  group: { key: string; label: string } | null
  query: string
}

export interface CarFormData {
  brand: string
  model: string
  manufacture_month: string
  manufacture_year: string
  purchase_date: string
  purchase_mileage: string
  current_mileage: string
  purchase_price: string
  vin: string
}

export interface PartFormData {
  category: string
  name: string
  part_number: string
  notes: string
}
