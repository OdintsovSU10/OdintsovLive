import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { RECORD_TABLES } from '../constants'
import type {
  CarRecord, CarType, ExpenseType, FuelType, MaintenanceType, PartType, RecordPayload, ServiceUnitType
} from '../types'

// Локальная правка списков вместо перечитывания таблицы: одно действие — один запрос.
// Порядок как в запросах: записи — новые даты сверху, агрегаты — по времени создания
function putByDate<T extends { id: string; date: string }>(rows: T[], row: T): T[] {
  const next = rows.some(item => item.id === row.id)
    ? rows.map(item => (item.id === row.id ? row : item))
    : [row, ...rows]
  return next.sort((a, b) => b.date.localeCompare(a.date))
}

function putUnit(rows: ServiceUnitType[], row: ServiceUnitType): ServiceUnitType[] {
  const next = rows.some(item => item.id === row.id)
    ? rows.map(item => (item.id === row.id ? row : item))
    : [...rows, row]
  return next.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

function putPart(rows: PartType[], row: PartType): PartType[] {
  return rows.some(item => item.id === row.id)
    ? rows.map(item => (item.id === row.id ? row : item))
    : [...rows, row]
}

// withCatalog = false — только журнал (ТО, заправки, расходы): карточке на главной каталог и агрегаты не нужны
export function useCarRecords(
  car: CarType | null,
  onCarPatched: (id: string, fields: Partial<CarType>) => void,
  withCatalog = true
) {
  const [maintenance, setMaintenance] = useState<MaintenanceType[]>([])
  const [fuel, setFuel] = useState<FuelType[]>([])
  const [expenses, setExpenses] = useState<ExpenseType[]>([])
  const [parts, setParts] = useState<PartType[]>([])
  const [units, setUnits] = useState<ServiceUnitType[]>([])
  const [loading, setLoading] = useState(true)
  // Ответ для прошлого авто, пришедший после переключения, игнорируем
  const requestRef = useRef(0)
  const carId = car?.id ?? null
  // Строка, сохранённая для прошлого авто после переключения, в списки текущего не попадает
  const carIdRef = useRef(carId)
  const isCurrentCar = (row: { car_id: string }) => row.car_id === carIdRef.current

  const loadAll = useCallback(async () => {
    const request = ++requestRef.current
    carIdRef.current = carId
    setMaintenance([])
    setFuel([])
    setExpenses([])
    setParts([])
    setUnits([])
    if (!carId) {
      setLoading(false)
      return
    }

    setLoading(true)
    const [maintenanceRes, fuelRes, expensesRes, partsRes, unitsRes] = await Promise.all([
      supabase.from('car_maintenance').select('*').eq('car_id', carId).order('date', { ascending: false }),
      supabase.from('car_fuel').select('*').eq('car_id', carId).order('date', { ascending: false }),
      supabase.from('car_expenses').select('*').eq('car_id', carId).order('date', { ascending: false }),
      withCatalog
        ? supabase.from('car_parts').select('*').eq('car_id', carId).order('category', { ascending: true })
        : null,
      withCatalog
        ? supabase.from('car_service_units').select('*').eq('car_id', carId).order('created_at', { ascending: true })
        : null
    ])
    if (request !== requestRef.current) return

    setMaintenance(maintenanceRes.data ?? [])
    setFuel(fuelRes.data ?? [])
    setExpenses(expensesRes.data ?? [])
    setParts(partsRes?.data ?? [])
    setUnits(unitsRes?.data ?? [])
    setLoading(false)
  }, [carId, withCatalog])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const putRecord = (record: CarRecord) => {
    if (!isCurrentCar(record.row)) return
    if (record.kind === 'maintenance') setMaintenance(rows => putByDate(rows, record.row))
    if (record.kind === 'fuel') setFuel(rows => putByDate(rows, record.row))
    if (record.kind === 'expense') setExpenses(rows => putByDate(rows, record.row))
  }

  const dropRecord = (record: CarRecord) => {
    const keep = (row: { id: string }) => row.id !== record.row.id
    if (record.kind === 'maintenance') setMaintenance(rows => rows.filter(keep))
    if (record.kind === 'fuel') setFuel(rows => rows.filter(keep))
    if (record.kind === 'expense') setExpenses(rows => rows.filter(keep))
  }

  const saveRecord = async (payload: RecordPayload, editingId?: string): Promise<boolean> => {
    if (!car) return false
    const table = RECORD_TABLES[payload.kind]
    // Сохранённая строка возвращается тем же запросом
    const write = editingId
      ? supabase.from(table).update(payload.data).eq('id', editingId).select().single()
      : supabase.from(table).insert({ ...payload.data, car_id: car.id }).select().single()

    // Пробег записи больше текущего — обновляем авто параллельно, одним заходом в сеть
    const mileage = 'mileage' in payload.data ? payload.data.mileage : null
    const newMileage = mileage && mileage > car.current_mileage ? mileage : null
    const [{ data, error }, carRes] = await Promise.all([
      write,
      newMileage ? supabase.from('cars').update({ current_mileage: newMileage }).eq('id', car.id) : null
    ])
    if (newMileage && carRes && !carRes.error) onCarPatched(car.id, { current_mileage: newMileage })
    if (error || !data) return false

    putRecord({ kind: payload.kind, row: data } as CarRecord)
    return true
  }

  const deleteRecord = async (record: CarRecord): Promise<boolean> => {
    const { error } = await supabase.from(RECORD_TABLES[record.kind]).delete().eq('id', record.row.id)
    if (error) return false
    dropRecord(record)
    return true
  }

  // Отмена удаления: та же строка с тем же id
  const restoreRecord = async (record: CarRecord): Promise<boolean> => {
    const { error } = await supabase.from(RECORD_TABLES[record.kind]).insert(record.row)
    if (error) return false
    putRecord(record)
    return true
  }

  const savePart = async (data: Omit<PartType, 'id' | 'car_id'>, editingId?: string): Promise<boolean> => {
    if (!carId) return false
    const { data: row, error } = editingId
      ? await supabase.from('car_parts').update(data).eq('id', editingId).select().single()
      : await supabase.from('car_parts').insert({ ...data, car_id: carId }).select().single()
    if (error || !row) return false
    if (isCurrentCar(row)) setParts(rows => putPart(rows, row))
    return true
  }

  const deletePart = async (part: PartType): Promise<boolean> => {
    const { error } = await supabase.from('car_parts').delete().eq('id', part.id)
    if (error) return false
    setParts(rows => rows.filter(row => row.id !== part.id))
    return true
  }

  const restorePart = async (part: PartType): Promise<boolean> => {
    const { error } = await supabase.from('car_parts').insert(part)
    if (error) return false
    if (isCurrentCar(part)) setParts(rows => putPart(rows, part))
    return true
  }

  const importParts = async (rows: Omit<PartType, 'id' | 'car_id'>[]): Promise<boolean> => {
    if (!carId || rows.length === 0) return false
    const { data, error } = await supabase
      .from('car_parts')
      .insert(rows.map(row => ({ ...row, car_id: carId })))
      .select()
    if (error || !data) return false
    if (carId === carIdRef.current) setParts(prev => [...prev, ...data])
    return true
  }

  const saveUnit = async (data: Omit<ServiceUnitType, 'id' | 'car_id'>, editingId?: string): Promise<boolean> => {
    if (!carId) return false
    const { data: row, error } = editingId
      ? await supabase.from('car_service_units').update(data).eq('id', editingId).select().single()
      : await supabase.from('car_service_units').insert({ ...data, car_id: carId }).select().single()
    if (error || !row) return false
    if (isCurrentCar(row)) setUnits(rows => putUnit(rows, row))
    return true
  }

  // Новый агрегат из формы записи: id нужен сразу, чтобы отметить его в этой же записи
  const createUnit = async (name: string): Promise<string | null> => {
    if (!carId) return null
    const { data, error } = await supabase
      .from('car_service_units')
      .insert({ car_id: carId, name, replaced_mileage: null })
      .select()
      .single()
    if (error || !data) return null
    if (isCurrentCar(data)) setUnits(rows => putUnit(rows, data))
    return data.id
  }

  const deleteUnit = async (unit: ServiceUnitType): Promise<boolean> => {
    const { error } = await supabase.from('car_service_units').delete().eq('id', unit.id)
    if (error) return false
    setUnits(rows => rows.filter(row => row.id !== unit.id))
    return true
  }

  // Тот же id: отметки о замене в записях ТО снова укажут на агрегат
  const restoreUnit = async (unit: ServiceUnitType): Promise<boolean> => {
    const { error } = await supabase.from('car_service_units').insert(unit)
    if (error) return false
    if (isCurrentCar(unit)) setUnits(rows => putUnit(rows, unit))
    return true
  }

  return {
    maintenance, fuel, expenses, parts, units, loading,
    saveRecord, deleteRecord, restoreRecord,
    savePart, deletePart, restorePart, importParts,
    saveUnit, createUnit, deleteUnit, restoreUnit
  }
}
