import { useCallback, useEffect, useState } from 'react'
import { getUserId } from '../../../lib/auth'
import { supabase } from '../../../lib/supabase'
import type { CarType } from '../types'

const SELECTED_CAR_KEY = 'car:selected-id'

// Таблицы с записями авто: в проде у внешних ключей может не быть ON DELETE CASCADE
const CHILD_TABLES = ['car_fuel', 'car_maintenance', 'car_expenses', 'car_parts', 'car_calendar_events']
const FK_VIOLATION = '23503'

function readStoredId(): string | null {
  try {
    return localStorage.getItem(SELECTED_CAR_KEY)
  } catch {
    return null
  }
}

function storeId(id: string) {
  try {
    localStorage.setItem(SELECTED_CAR_KEY, id)
  } catch {
    // приватный режим — выбор просто не запомнится
  }
}

export function useCars() {
  const [cars, setCars] = useState<CarType[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(readStoredId)
  const [loading, setLoading] = useState(true)

  const loadCars = useCallback(async () => {
    const userId = await getUserId()
    if (!userId) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('cars')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (!error && data) setCars(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadCars()
  }, [loadCars])

  // Выбранное авто — всегда из свежего списка: правка и удаление сразу видны
  const selectedCar = cars.find(car => car.id === selectedId) ?? cars[0] ?? null

  const selectCar = useCallback((id: string) => {
    setSelectedId(id)
    storeId(id)
  }, [])

  // Правка машины в списке без перечитывания: пробег из записи, поля из формы
  const patchCar = useCallback((id: string, fields: Partial<CarType>) => {
    setCars(prev => prev.map(car => (car.id === id ? { ...car, ...fields } : car)))
  }, [])

  // Сохранённая строка возвращается тем же запросом — список правим локально
  const saveCar = async (carData: Partial<CarType>, editingId?: string): Promise<boolean> => {
    if (editingId) {
      const { data, error } = await supabase.from('cars').update(carData).eq('id', editingId).select().single()
      if (error || !data) return false
      patchCar(editingId, data)
      return true
    }

    const userId = await getUserId()
    if (!userId) return false
    const { data, error } = await supabase
      .from('cars')
      .insert({ ...carData, user_id: userId })
      .select()
      .single()
    if (error || !data) return false
    setCars(prev => [data, ...prev])
    selectCar(data.id)
    return true
  }

  const deleteCar = async (carId: string): Promise<boolean> => {
    const first = await supabase.from('cars').delete().eq('id', carId)
    let error = first.error

    // 23503 — нарушение внешнего ключа: каскада нет, сначала удаляем записи авто
    if (error?.code === FK_VIOLATION) {
      for (const table of CHILD_TABLES) {
        const child = await supabase.from(table).delete().eq('car_id', carId)
        if (child.error) return false
      }
      const retry = await supabase.from('cars').delete().eq('id', carId)
      error = retry.error
    }
    if (error) return false

    setCars(prev => prev.filter(car => car.id !== carId))
    return true
  }

  return { cars, selectedCar, selectCar, loading, patchCar, saveCar, deleteCar }
}
