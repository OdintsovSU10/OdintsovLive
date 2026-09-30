import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { RECORD_TABLES } from '../constants'
import type {
  CarRecord, CarType, ExpenseType, FuelType, MaintenanceType, PartType, RecordKind, RecordPayload
} from '../types'

export function useCarRecords(car: CarType | null, onCarChanged: () => Promise<void>) {
  const [maintenance, setMaintenance] = useState<MaintenanceType[]>([])
  const [fuel, setFuel] = useState<FuelType[]>([])
  const [expenses, setExpenses] = useState<ExpenseType[]>([])
  const [parts, setParts] = useState<PartType[]>([])
  const [loading, setLoading] = useState(true)
  // Ответ для прошлого авто, пришедший после переключения, игнорируем
  const requestRef = useRef(0)
  const carId = car?.id ?? null

  const loadAll = useCallback(async () => {
    const request = ++requestRef.current
    setMaintenance([])
    setFuel([])
    setExpenses([])
    setParts([])
    if (!carId) {
      setLoading(false)
      return
    }

    setLoading(true)
    const [maintenanceRes, fuelRes, expensesRes, partsRes] = await Promise.all([
      supabase.from('car_maintenance').select('*').eq('car_id', carId).order('date', { ascending: false }),
      supabase.from('car_fuel').select('*').eq('car_id', carId).order('date', { ascending: false }),
      supabase.from('car_expenses').select('*').eq('car_id', carId).order('date', { ascending: false }),
      supabase.from('car_parts').select('*').eq('car_id', carId).order('category', { ascending: true })
    ])
    if (request !== requestRef.current) return

    setMaintenance(maintenanceRes.data ?? [])
    setFuel(fuelRes.data ?? [])
    setExpenses(expensesRes.data ?? [])
    setParts(partsRes.data ?? [])
    setLoading(false)
  }, [carId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const reload = async (kind: RecordKind) => {
    if (!carId) return
    const { data } = await supabase
      .from(RECORD_TABLES[kind])
      .select('*')
      .eq('car_id', carId)
      .order('date', { ascending: false })
    if (!data) return
    if (kind === 'maintenance') setMaintenance(data)
    if (kind === 'fuel') setFuel(data)
    if (kind === 'expense') setExpenses(data)
  }

  const reloadParts = async () => {
    if (!carId) return
    const { data } = await supabase.from('car_parts').select('*').eq('car_id', carId).order('category', { ascending: true })
    if (data) setParts(data)
  }

  const saveRecord = async (payload: RecordPayload, editingId?: string): Promise<boolean> => {
    if (!car) return false
    const table = RECORD_TABLES[payload.kind]
    const { error } = editingId
      ? await supabase.from(table).update(payload.data).eq('id', editingId)
      : await supabase.from(table).insert({ ...payload.data, car_id: car.id })
    if (error) return false

    // Пробег записи больше текущего — обновляем авто и перечитываем список машин
    const mileage = 'mileage' in payload.data ? payload.data.mileage : null
    if (mileage && mileage > car.current_mileage) {
      await supabase.from('cars').update({ current_mileage: mileage }).eq('id', car.id)
      await onCarChanged()
    }

    await reload(payload.kind)
    return true
  }

  const deleteRecord = async (record: CarRecord): Promise<boolean> => {
    const { error } = await supabase.from(RECORD_TABLES[record.kind]).delete().eq('id', record.row.id)
    if (error) return false
    await reload(record.kind)
    return true
  }

  // Отмена удаления: та же строка с тем же id
  const restoreRecord = async (record: CarRecord): Promise<boolean> => {
    const { error } = await supabase.from(RECORD_TABLES[record.kind]).insert(record.row)
    if (error) return false
    await reload(record.kind)
    return true
  }

  const savePart = async (data: Omit<PartType, 'id' | 'car_id'>, editingId?: string): Promise<boolean> => {
    if (!carId) return false
    const { error } = editingId
      ? await supabase.from('car_parts').update(data).eq('id', editingId)
      : await supabase.from('car_parts').insert({ ...data, car_id: carId })
    if (error) return false
    await reloadParts()
    return true
  }

  const deletePart = async (part: PartType): Promise<boolean> => {
    const { error } = await supabase.from('car_parts').delete().eq('id', part.id)
    if (error) return false
    await reloadParts()
    return true
  }

  const restorePart = async (part: PartType): Promise<boolean> => {
    const { error } = await supabase.from('car_parts').insert(part)
    if (error) return false
    await reloadParts()
    return true
  }

  const importParts = async (rows: Omit<PartType, 'id' | 'car_id'>[]): Promise<boolean> => {
    if (!carId || rows.length === 0) return false
    const { error } = await supabase.from('car_parts').insert(rows.map(row => ({ ...row, car_id: carId })))
    if (error) return false
    await reloadParts()
    return true
  }

  return {
    maintenance, fuel, expenses, parts, loading,
    saveRecord, deleteRecord, restoreRecord,
    savePart, deletePart, restorePart, importParts
  }
}
