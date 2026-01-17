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

export type Tab = 'summary' | 'maintenance' | 'fuel' | 'expenses' | 'info'
export type ModalType = 'car' | 'maintenance' | 'fuel' | 'expense' | null
export type SortBy = 'date' | 'cost'
export type ChartTab = 'expenses' | 'mileage' | 'fuel'

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

export interface MaintenanceFormData {
  date: string
  mileage: string
  type: string
  cost: string
}

export interface FuelFormData {
  date: string
  mileage: string
  liters: string
  price_per_liter: string
  fuel_type: string
}

export interface ExpenseFormData {
  date: string
  category: string
  description: string
  cost: string
}

export interface PartFormData {
  category: string
  name: string
  part_number: string
  notes: string
}
