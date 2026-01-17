import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import type { CarType, MaintenanceType, FuelType, ExpenseType, PartType } from '../types'

export function useCarData() {
  const [cars, setCars] = useState<CarType[]>([])
  const [selectedCar, setSelectedCar] = useState<CarType | null>(null)
  const [loading, setLoading] = useState(true)

  const [maintenance, setMaintenance] = useState<MaintenanceType[]>([])
  const [fuel, setFuel] = useState<FuelType[]>([])
  const [expenses, setExpenses] = useState<ExpenseType[]>([])
  const [parts, setParts] = useState<PartType[]>([])

  const loadCars = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('cars')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setCars(data)
      if (data.length > 0 && !selectedCar) {
        setSelectedCar(data[0])
      }
    }
    setLoading(false)
  }, [selectedCar])

  const loadMaintenance = useCallback(async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_maintenance')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('date', { ascending: false })
    if (data) setMaintenance(data)
  }, [selectedCar])

  const loadFuel = useCallback(async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_fuel')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('date', { ascending: false })
    if (data) setFuel(data)
  }, [selectedCar])

  const loadExpenses = useCallback(async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_expenses')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('date', { ascending: false })
    if (data) setExpenses(data)
  }, [selectedCar])

  const loadParts = useCallback(async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_parts')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('category', { ascending: true })
    if (data) setParts(data)
  }, [selectedCar])

  useEffect(() => {
    loadCars()
  }, [])

  useEffect(() => {
    if (selectedCar) {
      loadMaintenance()
      loadFuel()
      loadExpenses()
      loadParts()
    }
  }, [selectedCar, loadMaintenance, loadFuel, loadExpenses, loadParts])

  const saveCar = async (carData: Partial<CarType>, editingCar: CarType | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (editingCar) {
      await supabase.from('cars').update(carData).eq('id', editingCar.id)
    } else {
      await supabase.from('cars').insert({ ...carData, user_id: user.id })
    }
    await loadCars()
  }

  const deleteCar = async (carId: string) => {
    await supabase.from('cars').delete().eq('id', carId)
    if (selectedCar?.id === carId) {
      setSelectedCar(null)
    }
    await loadCars()
  }

  const saveMaintenance = async (data: Partial<MaintenanceType>, editingId?: string) => {
    if (!selectedCar) return

    const mileage = data.mileage
    if (editingId) {
      await supabase.from('car_maintenance').update(data).eq('id', editingId)
    } else {
      await supabase.from('car_maintenance').insert({ ...data, car_id: selectedCar.id })
    }

    if (mileage && mileage > selectedCar.current_mileage) {
      await supabase.from('cars').update({ current_mileage: mileage }).eq('id', selectedCar.id)
      setSelectedCar({ ...selectedCar, current_mileage: mileage })
    }

    await loadMaintenance()
  }

  const deleteMaintenance = async (id: string) => {
    await supabase.from('car_maintenance').delete().eq('id', id)
    await loadMaintenance()
  }

  const saveFuel = async (data: Partial<FuelType>, editingId?: string) => {
    if (!selectedCar) return

    const mileage = data.mileage
    if (editingId) {
      await supabase.from('car_fuel').update(data).eq('id', editingId)
    } else {
      await supabase.from('car_fuel').insert({ ...data, car_id: selectedCar.id })
    }

    if (mileage && mileage > selectedCar.current_mileage) {
      await supabase.from('cars').update({ current_mileage: mileage }).eq('id', selectedCar.id)
      setSelectedCar({ ...selectedCar, current_mileage: mileage })
    }

    await loadFuel()
  }

  const deleteFuel = async (id: string) => {
    await supabase.from('car_fuel').delete().eq('id', id)
    await loadFuel()
  }

  const saveExpense = async (data: Partial<ExpenseType>, editingId?: string) => {
    if (!selectedCar) return

    if (editingId) {
      await supabase.from('car_expenses').update(data).eq('id', editingId)
    } else {
      await supabase.from('car_expenses').insert({ ...data, car_id: selectedCar.id })
    }

    await loadExpenses()
  }

  const deleteExpense = async (id: string) => {
    await supabase.from('car_expenses').delete().eq('id', id)
    await loadExpenses()
  }

  const savePart = async (data: Partial<PartType>, editingId?: string) => {
    if (!selectedCar) return

    if (editingId) {
      await supabase.from('car_parts').update(data).eq('id', editingId)
    } else {
      await supabase.from('car_parts').insert({ ...data, car_id: selectedCar.id })
    }

    await loadParts()
  }

  const deletePart = async (id: string) => {
    await supabase.from('car_parts').delete().eq('id', id)
    await loadParts()
  }

  const importParts = async (partsData: Partial<PartType>[]) => {
    if (!selectedCar || partsData.length === 0) return
    const partsToInsert = partsData.map(p => ({ ...p, car_id: selectedCar.id }))
    await supabase.from('car_parts').insert(partsToInsert)
    await loadParts()
  }

  return {
    cars,
    selectedCar,
    setSelectedCar,
    loading,
    maintenance,
    fuel,
    expenses,
    parts,
    loadCars,
    saveCar,
    deleteCar,
    saveMaintenance,
    deleteMaintenance,
    saveFuel,
    deleteFuel,
    saveExpense,
    deleteExpense,
    savePart,
    deletePart,
    importParts
  }
}
