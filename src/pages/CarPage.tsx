import { useState, useEffect } from 'react'
import { Plus, X, Car, ChevronDown, Fuel, Wrench, Receipt, BarChart3, Edit2, Trash2, Search, ArrowUpDown, Info, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import './CarPage.css'

interface CarType {
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

interface MaintenanceType {
  id: string
  car_id: string
  date: string
  mileage: number | null
  type: string
  description: string | null
  cost: number | null
}

interface FuelType {
  id: string
  car_id: string
  date: string
  mileage: number | null
  liters: number | null
  price_per_liter: number | null
  total_cost: number | null
  fuel_type: string
}

interface ExpenseType {
  id: string
  car_id: string
  date: string
  category: string
  description: string | null
  cost: number
}

interface PartType {
  id: string
  car_id: string
  category: string
  name: string
  part_number: string
  notes: string | null
}

type Tab = 'summary' | 'maintenance' | 'fuel' | 'expenses' | 'info'
type ModalType = 'car' | 'maintenance' | 'fuel' | 'expense' | null

const months = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const fuelTypes = ['АИ-95', 'АИ-100']
const expenseCategories = ['Мойка', 'Парковка', 'Штраф', 'Страховка', 'Налог', 'Запчасти', 'Аксессуары', 'Другое']
const partCategories = ['Двигатель', 'Трансмиссия', 'Подвеска', 'Тормоза', 'Фильтры', 'Жидкости', 'Электрика', 'Кузов', 'Салон', 'Другое']

export default function CarPage() {
  const [cars, setCars] = useState<CarType[]>([])
  const [selectedCar, setSelectedCar] = useState<CarType | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCarSelect, setShowCarSelect] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [modalType, setModalType] = useState<ModalType>(null)
  const [editingCar, setEditingCar] = useState<CarType | null>(null)

  const [maintenance, setMaintenance] = useState<MaintenanceType[]>([])
  const [fuel, setFuel] = useState<FuelType[]>([])
  const [expenses, setExpenses] = useState<ExpenseType[]>([])
  const [parts, setParts] = useState<PartType[]>([])
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceType | null>(null)
  const [editingFuel, setEditingFuel] = useState<FuelType | null>(null)
  const [editingExpense, setEditingExpense] = useState<ExpenseType | null>(null)
  const [editingPart, setEditingPart] = useState<PartType | null>(null)

  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    manufacture_month: '',
    manufacture_year: '',
    purchase_date: '',
    purchase_mileage: '',
    current_mileage: '',
    purchase_price: '',
    vin: ''
  })

  const getCarAge = (year: number, month?: number | null) => {
    const now = new Date()
    const carDate = new Date(year, (month || 1) - 1)
    let years = now.getFullYear() - carDate.getFullYear()
    let months = now.getMonth() - carDate.getMonth()
    if (months < 0) {
      years--
      months += 12
    }
    if (years === 0) return `${months} мес.`
    if (months === 0) return `${years} г.`
    return `${years} г. ${months} мес.`
  }

  const [maintenanceForm, setMaintenanceForm] = useState({
    date: '',
    mileage: '',
    type: '',
    cost: ''
  })

  const [fuelForm, setFuelForm] = useState({
    date: '',
    mileage: '',
    liters: '',
    price_per_liter: '',
    fuel_type: 'АИ-95'
  })

  const [expenseForm, setExpenseForm] = useState({
    date: '',
    category: '',
    description: '',
    cost: ''
  })

  const [partForm, setPartForm] = useState({
    category: '',
    name: '',
    part_number: '',
    notes: ''
  })

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [showFuelForm, setShowFuelForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showPartForm, setShowPartForm] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const [sortBy, setSortBy] = useState<'date' | 'cost'>('date')
  const [searchQuery, setSearchQuery] = useState('')
  const [chartTab, setChartTab] = useState<'expenses' | 'mileage' | 'fuel'>('expenses')

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
  }, [selectedCar])

  const loadCars = async () => {
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
  }

  const loadMaintenance = async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_maintenance')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('date', { ascending: false })
    if (data) setMaintenance(data)
  }

  const loadFuel = async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_fuel')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('date', { ascending: false })
    if (data) setFuel(data)
  }

  const loadExpenses = async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_expenses')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('date', { ascending: false })
    if (data) setExpenses(data)
  }

  const loadParts = async () => {
    if (!selectedCar) return
    const { data } = await supabase
      .from('car_parts')
      .select('*')
      .eq('car_id', selectedCar.id)
      .order('category', { ascending: true })
    if (data) setParts(data)
  }

  const resetCarForm = () => {
    setFormData({
      brand: '',
      model: '',
      manufacture_month: '',
      manufacture_year: '',
      purchase_date: '',
      purchase_mileage: '',
      current_mileage: '',
      purchase_price: '',
      vin: ''
    })
    setEditingCar(null)
  }

  const resetMaintenanceForm = () => {
    setMaintenanceForm({ date: '', mileage: '', type: '', cost: '' })
    setEditingMaintenance(null)
    setShowMaintenanceForm(false)
  }

  const resetFuelForm = () => {
    setFuelForm({ date: '', mileage: '', liters: '', price_per_liter: '', fuel_type: 'АИ-95' })
    setEditingFuel(null)
    setShowFuelForm(false)
  }

  const resetExpenseForm = () => {
    setExpenseForm({ date: '', category: '', description: '', cost: '' })
    setEditingExpense(null)
    setShowExpenseForm(false)
  }

  const resetPartForm = () => {
    setPartForm({ category: '', name: '', part_number: '', notes: '' })
    setEditingPart(null)
    setShowPartForm(false)
  }

  const openCarModal = () => {
    resetCarForm()
    setModalType('car')
  }

  const openEditCarModal = (car: CarType) => {
    setEditingCar(car)
    setFormData({
      brand: car.brand,
      model: car.model,
      manufacture_month: car.manufacture_month?.toString() || '',
      manufacture_year: car.manufacture_year.toString(),
      purchase_date: car.purchase_date,
      purchase_mileage: car.purchase_mileage.toString(),
      current_mileage: car.current_mileage.toString(),
      purchase_price: car.purchase_price?.toString() || '',
      vin: car.vin || ''
    })
    setModalType('car')
  }

  const openMaintenanceForm = (item?: MaintenanceType) => {
    if (item) {
      setEditingMaintenance(item)
      setMaintenanceForm({
        date: item.date,
        mileage: item.mileage?.toString() || '',
        type: item.type,
        cost: item.cost?.toString() || ''
      })
    } else {
      setMaintenanceForm({ date: '', mileage: '', type: '', cost: '' })
    }
    setShowMaintenanceForm(true)
  }

  const openFuelForm = (item?: FuelType) => {
    if (item) {
      setEditingFuel(item)
      setFuelForm({
        date: item.date,
        mileage: item.mileage?.toString() || '',
        liters: item.liters?.toString() || '',
        price_per_liter: item.price_per_liter?.toString() || '',
        fuel_type: item.fuel_type
      })
    } else {
      setFuelForm({ date: '', mileage: '', liters: '', price_per_liter: '', fuel_type: 'АИ-95' })
    }
    setShowFuelForm(true)
  }

  const openExpenseForm = (item?: ExpenseType) => {
    if (item) {
      setEditingExpense(item)
      setExpenseForm({
        date: item.date,
        category: item.category,
        description: item.description || '',
        cost: item.cost.toString()
      })
    } else {
      setExpenseForm({ date: '', category: '', description: '', cost: '' })
    }
    setShowExpenseForm(true)
  }

  const openPartForm = (item?: PartType) => {
    if (item) {
      setEditingPart(item)
      setPartForm({
        category: item.category,
        name: item.name,
        part_number: item.part_number,
        notes: item.notes || ''
      })
    } else {
      setPartForm({ category: '', name: '', part_number: '', notes: '' })
    }
    setShowPartForm(true)
  }

  const closeCarModal = () => {
    setModalType(null)
    resetCarForm()
  }

  const handleSaveCar = async () => {
    if (!formData.brand || !formData.model || !formData.manufacture_year || !formData.purchase_date) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const carData = {
      brand: formData.brand.trim(),
      model: formData.model.trim(),
      manufacture_month: formData.manufacture_month ? parseInt(formData.manufacture_month) : null,
      manufacture_year: parseInt(formData.manufacture_year),
      purchase_date: formData.purchase_date,
      purchase_mileage: parseInt(formData.purchase_mileage) || 0,
      current_mileage: parseInt(formData.current_mileage) || parseInt(formData.purchase_mileage) || 0,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      vin: formData.vin.trim() || null
    }

    if (editingCar) {
      await supabase.from('cars').update(carData).eq('id', editingCar.id)
    } else {
      await supabase.from('cars').insert({ ...carData, user_id: user.id })
    }

    closeCarModal()
    loadCars()
  }

  const handleSaveMaintenance = async () => {
    if (!selectedCar || !maintenanceForm.date || !maintenanceForm.type) return

    const mileage = maintenanceForm.mileage ? parseInt(maintenanceForm.mileage) : null

    const data = {
      car_id: selectedCar.id,
      date: maintenanceForm.date,
      mileage,
      type: maintenanceForm.type,
      cost: maintenanceForm.cost ? parseFloat(maintenanceForm.cost) : null
    }

    if (editingMaintenance) {
      await supabase.from('car_maintenance').update(data).eq('id', editingMaintenance.id)
    } else {
      await supabase.from('car_maintenance').insert(data)
    }

    if (mileage && mileage > selectedCar.current_mileage) {
      await supabase.from('cars').update({ current_mileage: mileage }).eq('id', selectedCar.id)
      setSelectedCar({ ...selectedCar, current_mileage: mileage })
    }

    resetMaintenanceForm()
    loadMaintenance()
  }

  const handleSaveFuel = async () => {
    if (!selectedCar || !fuelForm.date) return

    const mileage = fuelForm.mileage ? parseInt(fuelForm.mileage) : null
    const liters = fuelForm.liters ? parseFloat(fuelForm.liters) : null
    const pricePerLiter = fuelForm.price_per_liter ? parseFloat(fuelForm.price_per_liter) : null
    const totalCost = liters && pricePerLiter ? liters * pricePerLiter : null

    const data = {
      car_id: selectedCar.id,
      date: fuelForm.date,
      mileage,
      liters,
      price_per_liter: pricePerLiter,
      total_cost: totalCost,
      fuel_type: fuelForm.fuel_type
    }

    if (editingFuel) {
      await supabase.from('car_fuel').update(data).eq('id', editingFuel.id)
    } else {
      await supabase.from('car_fuel').insert(data)
    }

    if (mileage && mileage > selectedCar.current_mileage) {
      await supabase.from('cars').update({ current_mileage: mileage }).eq('id', selectedCar.id)
      setSelectedCar({ ...selectedCar, current_mileage: mileage })
    }

    resetFuelForm()
    loadFuel()
  }

  const handleSaveExpense = async () => {
    if (!selectedCar || !expenseForm.date || !expenseForm.category || !expenseForm.cost) return

    const data = {
      car_id: selectedCar.id,
      date: expenseForm.date,
      category: expenseForm.category,
      description: expenseForm.description || null,
      cost: parseFloat(expenseForm.cost)
    }

    if (editingExpense) {
      await supabase.from('car_expenses').update(data).eq('id', editingExpense.id)
    } else {
      await supabase.from('car_expenses').insert(data)
    }

    resetExpenseForm()
    loadExpenses()
  }

  const handleSavePart = async () => {
    if (!selectedCar || !partForm.category || !partForm.name || !partForm.part_number) return

    const data = {
      car_id: selectedCar.id,
      category: partForm.category,
      name: partForm.name,
      part_number: partForm.part_number,
      notes: partForm.notes || null
    }

    if (editingPart) {
      await supabase.from('car_parts').update(data).eq('id', editingPart.id)
    } else {
      await supabase.from('car_parts').insert(data)
    }

    resetPartForm()
    loadParts()
  }

  const handleDeleteCar = async (carId: string) => {
    await supabase.from('cars').delete().eq('id', carId)
    if (selectedCar?.id === carId) {
      setSelectedCar(null)
    }
    loadCars()
  }

  const handleDeleteMaintenance = async (id: string) => {
    await supabase.from('car_maintenance').delete().eq('id', id)
    loadMaintenance()
  }

  const handleDeleteFuel = async (id: string) => {
    await supabase.from('car_fuel').delete().eq('id', id)
    loadFuel()
  }

  const handleDeleteExpense = async (id: string) => {
    await supabase.from('car_expenses').delete().eq('id', id)
    loadExpenses()
  }

  const handleDeletePart = async (id: string) => {
    await supabase.from('car_parts').delete().eq('id', id)
    loadParts()
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedCar) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      const partsToInsert = rows
        .slice(1)
        .filter(row => row[0] && row[1] && row[2])
        .map(row => ({
          car_id: selectedCar.id,
          category: String(row[0]).trim(),
          name: String(row[1]).trim(),
          part_number: String(row[2]).trim(),
          notes: row[3] ? String(row[3]).trim() : null
        }))

      if (partsToInsert.length > 0) {
        await supabase.from('car_parts').insert(partsToInsert)
        loadParts()
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const formatPrice = (price: number | null) => {
    if (!price) return '—'
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽'
  }

  const formatMileage = (km: number) => {
    return new Intl.NumberFormat('ru-RU').format(km) + ' км'
  }

  const sortItems = <T extends { date: string; cost?: number | null; total_cost?: number | null }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      }
      const costA = a.cost ?? a.total_cost ?? 0
      const costB = b.cost ?? b.total_cost ?? 0
      return costB - costA
    })
  }

  const filteredMaintenance = sortItems(
    maintenance.filter(m => m.type.toLowerCase().includes(searchQuery.toLowerCase()))
  )
  const filteredFuel = sortItems(
    fuel.filter(f => f.fuel_type.toLowerCase().includes(searchQuery.toLowerCase()))
  )
  const filteredExpenses = sortItems(
    expenses.filter(e =>
      e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    )
  )

  const maintenanceTotal = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0)
  const fuelTotal = fuel.reduce((sum, f) => sum + (f.total_cost || 0), 0)
  const totalLiters = fuel.reduce((sum, f) => sum + (f.liters || 0), 0)
  const fuelMileages = fuel.filter(f => f.mileage).map(f => f.mileage!)
  const maxFuelMileage = fuelMileages.length > 0 ? Math.max(...fuelMileages) : 0
  const totalFuelKm = selectedCar && maxFuelMileage > 0
    ? maxFuelMileage - selectedCar.purchase_mileage
    : 0
  const avgConsumption = totalLiters > 0 && totalFuelKm > 0
    ? (totalLiters / totalFuelKm * 100).toFixed(1)
    : null
  const expensesTotal = expenses.reduce((sum, e) => sum + (e.cost || 0), 0)
  const allExpensesTotal = maintenanceTotal + fuelTotal + expensesTotal
  const totalCarCost = (selectedCar?.purchase_price || 0) + allExpensesTotal

  const getExpensesChartData = () => {
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

  const getMileageChartData = () => {
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

    // Добавляем текущий пробег как последнюю точку
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

  const getFuelPriceChartData = () => {
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

  const hasChartData = () => {
    if (chartTab === 'expenses') return getExpensesChartData().length > 1
    if (chartTab === 'mileage') return getMileageChartData().length > 1
    if (chartTab === 'fuel') return getFuelPriceChartData().length > 0
    return false
  }

  if (loading) {
    return <div className="car-page"><div className="loading">Загрузка...</div></div>
  }

  return (
    <div className="car-page">
      <div className="car-header">
        <h1>Машина</h1>
        <button className="add-car-btn" onClick={openCarModal}>
          <Plus size={20} />
          <span>Добавить авто</span>
        </button>
      </div>

      {cars.length === 0 ? (
        <div className="no-cars">
          <Car size={48} strokeWidth={1} />
          <p>Нет добавленных автомобилей</p>
          <button className="add-first-car-btn" onClick={openCarModal}>
            Добавить автомобиль
          </button>
        </div>
      ) : (
        <>
          <div className="car-selector" onClick={() => setShowCarSelect(!showCarSelect)}>
            <div className="selected-car">
              <Car size={20} />
              <span>{selectedCar?.brand} {selectedCar?.model} <span className="car-age-small">({selectedCar && getCarAge(selectedCar.manufacture_year, selectedCar.manufacture_month)})</span></span>
              <ChevronDown size={18} className={showCarSelect ? 'rotated' : ''} />
            </div>
            {showCarSelect && (
              <div className="car-dropdown">
                {cars.map(car => (
                  <div
                    key={car.id}
                    className={`car-option ${selectedCar?.id === car.id ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedCar(car)
                      setShowCarSelect(false)
                    }}
                  >
                    <span>{car.brand} {car.model} <span className="car-age-small">({getCarAge(car.manufacture_year, car.manufacture_month)})</span></span>
                    <div className="car-option-actions">
                      <button onClick={(e) => { e.stopPropagation(); openEditCarModal(car) }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteCar(car.id) }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCar && (
            <>
              <div className="car-tabs">
                <button
                  className={`car-tab ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  <BarChart3 size={18} />
                  <span>Сводная</span>
                </button>
                <button
                  className={`car-tab ${activeTab === 'maintenance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('maintenance')}
                >
                  <Wrench size={18} />
                  <span>ТО</span>
                </button>
                <button
                  className={`car-tab ${activeTab === 'fuel' ? 'active' : ''}`}
                  onClick={() => setActiveTab('fuel')}
                >
                  <Fuel size={18} />
                  <span>Бензин</span>
                </button>
                <button
                  className={`car-tab ${activeTab === 'expenses' ? 'active' : ''}`}
                  onClick={() => setActiveTab('expenses')}
                >
                  <Receipt size={18} />
                  <span>Допы</span>
                </button>
                <button
                  className={`car-tab ${activeTab === 'info' ? 'active' : ''}`}
                  onClick={() => setActiveTab('info')}
                >
                  <Info size={18} />
                  <span>Инфо</span>
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'summary' && (
                  <div className="summary-tab">
                    <div className="car-info-card">
                      {selectedCar.vin && <div className="car-vin-header">{selectedCar.vin}</div>}
                      <div className="car-info-grid">
                        <div className="info-item">
                          <span className="info-label">Год выпуска</span>
                          <span className="info-value">
                            {selectedCar.manufacture_month ? months[selectedCar.manufacture_month - 1] + ' ' : ''}
                            {selectedCar.manufacture_year}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Дата покупки</span>
                          <span className="info-value">
                            {new Date(selectedCar.purchase_date).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Пробег при покупке</span>
                          <span className="info-value">{formatMileage(selectedCar.purchase_mileage)}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Текущий пробег</span>
                          <span className="info-value highlight">{formatMileage(selectedCar.current_mileage)}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Пройдено</span>
                          <span className="info-value">
                            {formatMileage(selectedCar.current_mileage - selectedCar.purchase_mileage)}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Стоимость покупки</span>
                          <span className="info-value">{formatPrice(selectedCar.purchase_price)}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Всего расходов</span>
                          <span className="info-value">{formatPrice(allExpensesTotal)}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Общая стоимость</span>
                          <span className="info-value highlight">{formatPrice(totalCarCost)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="car-chart-card">
                      <div className="chart-tabs">
                        <button
                          className={`chart-tab ${chartTab === 'expenses' ? 'active' : ''}`}
                          onClick={() => setChartTab('expenses')}
                        >Расходы</button>
                        <button
                          className={`chart-tab ${chartTab === 'mileage' ? 'active' : ''}`}
                          onClick={() => setChartTab('mileage')}
                        >Пробег</button>
                        <button
                          className={`chart-tab ${chartTab === 'fuel' ? 'active' : ''}`}
                          onClick={() => setChartTab('fuel')}
                        >Бензин</button>
                      </div>

                      {hasChartData() ? (
                        <div className="chart-container">
                          <ResponsiveContainer width="100%" height={220}>
                            {chartTab === 'expenses' ? (
                              <AreaChart data={getExpensesChartData()}>
                                <defs>
                                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} кк` : `${(v / 1000).toFixed(0)}к`} tick={{ fontSize: 11 }} width={50} />
                                <Tooltip formatter={(value) => [formatPrice(value as number), 'Итого']} />
                                <Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} fill="url(#colorTotal)" />
                              </AreaChart>
                            ) : chartTab === 'mileage' ? (
                              <AreaChart data={getMileageChartData()}>
                                <defs>
                                  <linearGradient id="colorMileage" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} кк` : `${(v / 1000).toFixed(0)}к`} tick={{ fontSize: 11 }} width={50} />
                                <Tooltip formatter={(value) => [formatMileage(value as number), 'Пробег']} />
                                <Area type="monotone" dataKey="mileage" stroke="#3b82f6" strokeWidth={2} fill="url(#colorMileage)" />
                              </AreaChart>
                            ) : (
                              <LineChart data={getFuelPriceChartData()}>
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={(v) => `${v}₽`} tick={{ fontSize: 11 }} width={45} domain={['dataMin - 2', 'dataMax + 2']} />
                                <Tooltip formatter={(value) => value ? [`${value} ₽/л`, ''] : ['-', '']} />
                                <Legend />
                                <Line type="monotone" dataKey="ai95" name="АИ-95" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                                <Line type="monotone" dataKey="ai100" name="АИ-100" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                              </LineChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="chart-empty">
                          {chartTab === 'expenses' && 'Добавьте расходы для отображения графика'}
                          {chartTab === 'mileage' && 'Добавьте записи с пробегом'}
                          {chartTab === 'fuel' && 'Добавьте заправки с ценой за литр'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'maintenance' && (
                  <div className="maintenance-tab">
                    <div className="tab-toolbar">
                      <div className="search-box">
                        <Search size={16} />
                        <input type="text" placeholder="Поиск..." value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)} />
                      </div>
                      <button className="sort-btn" onClick={() => setSortBy(sortBy === 'date' ? 'cost' : 'date')}>
                        <ArrowUpDown size={16} />
                        <span>{sortBy === 'date' ? 'Дата' : 'Сумма'}</span>
                      </button>
                      <span className="stat-total">{formatPrice(maintenanceTotal)}</span>
                      {!showMaintenanceForm && (
                        <button className="add-record-btn" onClick={() => openMaintenanceForm()}>
                          <Plus size={18} />
                          <span>Добавить</span>
                        </button>
                      )}
                    </div>
                    {showMaintenanceForm && (
                      <div className="inline-form">
                        <div className="inline-form-row">
                          <input type="date" value={maintenanceForm.date}
                            onChange={e => setMaintenanceForm({ ...maintenanceForm, date: e.target.value })} />
                          <input type="number" placeholder="Пробег" value={maintenanceForm.mileage}
                            onChange={e => setMaintenanceForm({ ...maintenanceForm, mileage: e.target.value })} />
                          <input type="text" placeholder="Тип работ" value={maintenanceForm.type}
                            onChange={e => setMaintenanceForm({ ...maintenanceForm, type: e.target.value })} />
                          <input type="number" placeholder="Стоимость" value={maintenanceForm.cost}
                            onChange={e => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })} />
                        </div>
                        <div className="inline-form-actions">
                          <button className="btn-cancel" onClick={resetMaintenanceForm}>Отмена</button>
                          <button className="btn-save" onClick={handleSaveMaintenance}
                            disabled={!maintenanceForm.date || !maintenanceForm.type}>
                            {editingMaintenance ? 'Сохранить' : 'Добавить'}
                          </button>
                        </div>
                      </div>
                    )}
                    {filteredMaintenance.length === 0 && !showMaintenanceForm ? (
                      <div className="empty-tab">
                        <Wrench size={40} strokeWidth={1} />
                        <p>{searchQuery ? 'Ничего не найдено' : 'Записи о ТО появятся здесь'}</p>
                      </div>
                    ) : (
                      <div className="records-list">
                        {filteredMaintenance.map(item => (
                          <div key={item.id} className="record-card">
                            <div className="record-main">
                              <div className="record-info">
                                <span className="record-date">{new Date(item.date).toLocaleDateString('ru-RU')}</span>
                                <span className="record-type">{item.type}</span>
                                {item.mileage && <span className="record-mileage">{formatMileage(item.mileage)}</span>}
                              </div>
                            </div>
                            <div className="record-right">
                              <span className="record-cost">{formatPrice(item.cost)}</span>
                              <div className="record-actions">
                                <button onClick={() => openMaintenanceForm(item)}><Edit2 size={14} /></button>
                                <button onClick={() => handleDeleteMaintenance(item.id)}><Trash2 size={14} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'fuel' && (
                  <div className="fuel-tab">
                    <div className="tab-toolbar">
                      <div className="search-box">
                        <Search size={16} />
                        <input type="text" placeholder="Поиск..." value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)} />
                      </div>
                      <button className="sort-btn" onClick={() => setSortBy(sortBy === 'date' ? 'cost' : 'date')}>
                        <ArrowUpDown size={16} />
                        <span>{sortBy === 'date' ? 'Дата' : 'Сумма'}</span>
                      </button>
                      <span className="stat-total">{formatPrice(fuelTotal)}</span>
                      {!showFuelForm && (
                        <button className="add-record-btn" onClick={() => openFuelForm()}>
                          <Plus size={18} />
                          <span>Добавить</span>
                        </button>
                      )}
                    </div>
                    {fuel.length > 0 && (
                      <div className="fuel-stats">
                        <div className="fuel-stat-item">
                          <span className="fuel-stat-value">{totalLiters.toFixed(1)} л</span>
                          <span className="fuel-stat-label">Сожжено</span>
                        </div>
                        <div className="fuel-stat-item">
                          <span className="fuel-stat-value">{formatMileage(totalFuelKm)}</span>
                          <span className="fuel-stat-label">Пройдено</span>
                        </div>
                        <div className="fuel-stat-item accent">
                          <span className="fuel-stat-value">{avgConsumption ? `${avgConsumption} л` : '—'}</span>
                          <span className="fuel-stat-label">Расход / 100 км</span>
                        </div>
                      </div>
                    )}
                    {showFuelForm && (
                      <div className="inline-form">
                        <div className="inline-form-row">
                          <input type="date" value={fuelForm.date}
                            onChange={e => setFuelForm({ ...fuelForm, date: e.target.value })} />
                          <input type="number" placeholder="Пробег" value={fuelForm.mileage}
                            onChange={e => setFuelForm({ ...fuelForm, mileage: e.target.value })} />
                          <select value={fuelForm.fuel_type}
                            onChange={e => setFuelForm({ ...fuelForm, fuel_type: e.target.value })}>
                            {fuelTypes.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="inline-form-row">
                          <input type="number" step="0.01" placeholder="Литры" value={fuelForm.liters}
                            onChange={e => setFuelForm({ ...fuelForm, liters: e.target.value })} />
                          <input type="number" step="0.01" placeholder="₽/литр" value={fuelForm.price_per_liter}
                            onChange={e => setFuelForm({ ...fuelForm, price_per_liter: e.target.value })} />
                          <span className="calc-total">
                            = {fuelForm.liters && fuelForm.price_per_liter
                              ? formatPrice(parseFloat(fuelForm.liters) * parseFloat(fuelForm.price_per_liter))
                              : '—'}
                          </span>
                        </div>
                        <div className="inline-form-actions">
                          <button className="btn-cancel" onClick={resetFuelForm}>Отмена</button>
                          <button className="btn-save" onClick={handleSaveFuel} disabled={!fuelForm.date}>
                            {editingFuel ? 'Сохранить' : 'Добавить'}
                          </button>
                        </div>
                      </div>
                    )}
                    {filteredFuel.length === 0 && !showFuelForm ? (
                      <div className="empty-tab">
                        <Fuel size={40} strokeWidth={1} />
                        <p>{searchQuery ? 'Ничего не найдено' : 'Записи о заправках появятся здесь'}</p>
                      </div>
                    ) : (
                      <div className="records-list">
                        {filteredFuel.map(item => (
                          <div key={item.id} className="record-card">
                            <div className="record-main">
                              <div className="record-info">
                                <span className="record-date">{new Date(item.date).toLocaleDateString('ru-RU')}</span>
                                <span className="record-type">{item.fuel_type}</span>
                                {item.mileage && <span className="record-mileage">{formatMileage(item.mileage)}</span>}
                              </div>
                              <div className="fuel-details">
                                {item.liters && <span>{item.liters} л</span>}
                                {item.price_per_liter && <span>× {item.price_per_liter} ₽/л</span>}
                              </div>
                            </div>
                            <div className="record-right">
                              <span className="record-cost">{formatPrice(item.total_cost)}</span>
                              <div className="record-actions">
                                <button onClick={() => openFuelForm(item)}><Edit2 size={14} /></button>
                                <button onClick={() => handleDeleteFuel(item.id)}><Trash2 size={14} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'expenses' && (
                  <div className="expenses-tab">
                    <div className="tab-toolbar">
                      <div className="search-box">
                        <Search size={16} />
                        <input type="text" placeholder="Поиск..." value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)} />
                      </div>
                      <button className="sort-btn" onClick={() => setSortBy(sortBy === 'date' ? 'cost' : 'date')}>
                        <ArrowUpDown size={16} />
                        <span>{sortBy === 'date' ? 'Дата' : 'Сумма'}</span>
                      </button>
                      <span className="stat-total">{formatPrice(expensesTotal)}</span>
                      {!showExpenseForm && (
                        <button className="add-record-btn" onClick={() => openExpenseForm()}>
                          <Plus size={18} />
                          <span>Добавить</span>
                        </button>
                      )}
                    </div>
                    {showExpenseForm && (
                      <div className="inline-form">
                        <div className="inline-form-row">
                          <input type="date" value={expenseForm.date}
                            onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                          <select value={expenseForm.category}
                            onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                            <option value="">Категория</option>
                            {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input type="number" placeholder="Стоимость" value={expenseForm.cost}
                            onChange={e => setExpenseForm({ ...expenseForm, cost: e.target.value })} />
                        </div>
                        <div className="inline-form-row">
                          <input type="text" placeholder="Описание (необязательно)" value={expenseForm.description}
                            onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                            style={{ flex: 1 }} />
                        </div>
                        <div className="inline-form-actions">
                          <button className="btn-cancel" onClick={resetExpenseForm}>Отмена</button>
                          <button className="btn-save" onClick={handleSaveExpense}
                            disabled={!expenseForm.date || !expenseForm.category || !expenseForm.cost}>
                            {editingExpense ? 'Сохранить' : 'Добавить'}
                          </button>
                        </div>
                      </div>
                    )}
                    {filteredExpenses.length === 0 && !showExpenseForm ? (
                      <div className="empty-tab">
                        <Receipt size={40} strokeWidth={1} />
                        <p>{searchQuery ? 'Ничего не найдено' : 'Дополнительные расходы появятся здесь'}</p>
                      </div>
                    ) : (
                      <div className="records-list">
                        {filteredExpenses.map(item => (
                          <div key={item.id} className="record-card">
                            <div className="record-main">
                              <div className="record-info">
                                <span className="record-date">{new Date(item.date).toLocaleDateString('ru-RU')}</span>
                                <span className="record-type">
                                  {item.description || item.category}
                                  {item.description && <span className="record-category"> ({item.category})</span>}
                                </span>
                              </div>
                            </div>
                            <div className="record-right">
                              <span className="record-cost">{formatPrice(item.cost)}</span>
                              <div className="record-actions">
                                <button onClick={() => openExpenseForm(item)}><Edit2 size={14} /></button>
                                <button onClick={() => handleDeleteExpense(item.id)}><Trash2 size={14} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'info' && (
                  <div className="info-tab">
                    <div className="tab-toolbar">
                      <div className="search-box">
                        <Search size={16} />
                        <input type="text" placeholder="Поиск..." value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)} />
                      </div>
                      <span className="stat-count">{parts.length} запчастей</span>
                      {!showPartForm && (
                        <>
                          <label className="import-btn">
                            <Upload size={18} />
                            <span>Импорт</span>
                            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} hidden />
                          </label>
                          <button className="add-record-btn" onClick={() => openPartForm()}>
                            <Plus size={18} />
                            <span>Добавить</span>
                          </button>
                        </>
                      )}
                    </div>
                    {showPartForm && (
                      <div className="inline-form">
                        <div className="inline-form-row">
                          <select value={partForm.category}
                            onChange={e => setPartForm({ ...partForm, category: e.target.value })}>
                            <option value="">Категория</option>
                            {partCategories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input type="text" placeholder="Название" value={partForm.name}
                            onChange={e => setPartForm({ ...partForm, name: e.target.value })} />
                        </div>
                        <div className="inline-form-row">
                          <input type="text" placeholder="Артикул / код" value={partForm.part_number}
                            onChange={e => setPartForm({ ...partForm, part_number: e.target.value })} />
                          <input type="text" placeholder="Заметка (необязательно)" value={partForm.notes}
                            onChange={e => setPartForm({ ...partForm, notes: e.target.value })} />
                        </div>
                        <div className="inline-form-actions">
                          <button className="btn-cancel" onClick={resetPartForm}>Отмена</button>
                          <button className="btn-save" onClick={handleSavePart}
                            disabled={!partForm.category || !partForm.name || !partForm.part_number}>
                            {editingPart ? 'Сохранить' : 'Добавить'}
                          </button>
                        </div>
                      </div>
                    )}
                    {parts.filter(p =>
                      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      p.part_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      p.category.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && !showPartForm ? (
                      <div className="empty-tab">
                        <Info size={40} strokeWidth={1} />
                        <p>{searchQuery ? 'Ничего не найдено' : 'Коды запчастей появятся здесь'}</p>
                      </div>
                    ) : (
                      <div className="parts-list">
                        {partCategories.map(category => {
                          const categoryParts = parts.filter(p =>
                            p.category === category &&
                            (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             p.part_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             p.category.toLowerCase().includes(searchQuery.toLowerCase()))
                          )
                          if (categoryParts.length === 0) return null
                          const isExpanded = expandedCategories.has(category)
                          return (
                            <div key={category} className="parts-category">
                              <button className="parts-category-header" onClick={() => toggleCategory(category)}>
                                <ChevronDown size={18} className={isExpanded ? 'rotated' : ''} />
                                <span className="parts-category-title">{category}</span>
                                <span className="parts-category-count">{categoryParts.length}</span>
                              </button>
                              {isExpanded && (
                                <div className="parts-items">
                                  {categoryParts.map(part => (
                                    <div key={part.id} className="part-row">
                                      <span className="part-name">{part.name}</span>
                                      <span className="part-separator">—</span>
                                      <span className="part-number">{part.part_number}</span>
                                      {part.notes && <span className="part-notes">({part.notes})</span>}
                                      <div className="part-actions">
                                        <button onClick={() => openPartForm(part)}><Edit2 size={14} /></button>
                                        <button onClick={() => handleDeletePart(part.id)}><Trash2 size={14} /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {modalType === 'car' && (
        <div className="modal-overlay" onClick={closeCarModal}>
          <div className="car-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCar ? 'Редактировать авто' : 'Добавить авто'}</h2>
              <button className="close-btn" onClick={closeCarModal}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Марка *</label>
                  <input type="text" placeholder="Toyota" value={formData.brand}
                    onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Модель *</label>
                  <input type="text" placeholder="Camry" value={formData.model}
                    onChange={e => setFormData({ ...formData, model: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Месяц выпуска</label>
                  <select value={formData.manufacture_month}
                    onChange={e => setFormData({ ...formData, manufacture_month: e.target.value })}>
                    <option value="">—</option>
                    {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Год выпуска *</label>
                  <input type="number" placeholder="2020" value={formData.manufacture_year}
                    onChange={e => setFormData({ ...formData, manufacture_year: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Дата покупки *</label>
                <input type="date" value={formData.purchase_date}
                  onChange={e => setFormData({ ...formData, purchase_date: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Пробег при покупке (км)</label>
                  <input type="number" placeholder="50000" value={formData.purchase_mileage}
                    onChange={e => setFormData({ ...formData, purchase_mileage: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Текущий пробег (км)</label>
                  <input type="number" placeholder="55000" value={formData.current_mileage}
                    onChange={e => setFormData({ ...formData, current_mileage: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Стоимость покупки (₽)</label>
                <input type="number" placeholder="1500000" value={formData.purchase_price}
                  onChange={e => setFormData({ ...formData, purchase_price: e.target.value })} />
              </div>
              <div className="form-group">
                <label>VIN</label>
                <input type="text" placeholder="JTDKN3DU5A0123456" value={formData.vin}
                  onChange={e => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                  maxLength={17} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeCarModal}>Отмена</button>
              <button className="btn-save" onClick={handleSaveCar}
                disabled={!formData.brand || !formData.model || !formData.manufacture_year || !formData.purchase_date}>
                {editingCar ? 'Сохранить' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
