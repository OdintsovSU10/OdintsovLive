import { useState } from 'react'
import { Plus, X, Car, ChevronDown, Fuel, Wrench, Receipt, BarChart3, Edit2, Trash2, Info } from 'lucide-react'
import { MONTHS } from '../../lib/constants'
import { calcAge } from '../../lib/dateUtils'
import { useCarData } from './hooks/useCarData'
import { SummaryTab, MaintenanceTab, FuelTab, ExpensesTab, InfoTab } from './components/tabs'
import type {
  Tab, ChartTab, SortBy, CarType,
  MaintenanceType, FuelType, ExpenseType, PartType,
  CarFormData, MaintenanceFormData, FuelFormData, ExpenseFormData, PartFormData
} from './types'
import '../CarPage.css'

const initialCarForm: CarFormData = {
  brand: '', model: '', manufacture_month: '', manufacture_year: '',
  purchase_date: '', purchase_mileage: '', current_mileage: '', purchase_price: '', vin: ''
}
const initialMaintenanceForm: MaintenanceFormData = { date: '', mileage: '', type: '', cost: '' }
const initialFuelForm: FuelFormData = { date: '', mileage: '', liters: '', price_per_liter: '', fuel_type: 'АИ-95' }
const initialExpenseForm: ExpenseFormData = { date: '', category: '', description: '', cost: '' }
const initialPartForm: PartFormData = { category: '', name: '', part_number: '', notes: '' }

export default function CarPage() {
  const {
    cars, selectedCar, setSelectedCar, loading,
    maintenance, fuel, expenses, parts,
    saveCar, deleteCar, saveMaintenance, deleteMaintenance,
    saveFuel, deleteFuel, saveExpense, deleteExpense, savePart, deletePart, importParts
  } = useCarData()

  const [showCarSelect, setShowCarSelect] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [showCarModal, setShowCarModal] = useState(false)
  const [editingCar, setEditingCar] = useState<CarType | null>(null)
  const [formData, setFormData] = useState<CarFormData>(initialCarForm)

  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceType | null>(null)
  const [editingFuel, setEditingFuel] = useState<FuelType | null>(null)
  const [editingExpense, setEditingExpense] = useState<ExpenseType | null>(null)
  const [editingPart, setEditingPart] = useState<PartType | null>(null)

  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormData>(initialMaintenanceForm)
  const [fuelForm, setFuelForm] = useState<FuelFormData>(initialFuelForm)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormData>(initialExpenseForm)
  const [partForm, setPartForm] = useState<PartFormData>(initialPartForm)

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [showFuelForm, setShowFuelForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showPartForm, setShowPartForm] = useState(false)

  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [searchQuery, setSearchQuery] = useState('')
  const [chartTab, setChartTab] = useState<ChartTab>('expenses')

  const openCarModal = () => {
    setFormData(initialCarForm)
    setEditingCar(null)
    setShowCarModal(true)
  }

  const openEditCarModal = (car: CarType) => {
    setEditingCar(car)
    setFormData({
      brand: car.brand, model: car.model,
      manufacture_month: car.manufacture_month?.toString() || '',
      manufacture_year: car.manufacture_year.toString(),
      purchase_date: car.purchase_date,
      purchase_mileage: car.purchase_mileage.toString(),
      current_mileage: car.current_mileage.toString(),
      purchase_price: car.purchase_price?.toString() || '',
      vin: car.vin || ''
    })
    setShowCarModal(true)
  }

  const closeCarModal = () => {
    setShowCarModal(false)
    setEditingCar(null)
    setFormData(initialCarForm)
  }

  const handleSaveCar = async () => {
    if (!formData.brand || !formData.model || !formData.manufacture_year || !formData.purchase_date) return
    await saveCar({
      brand: formData.brand.trim(), model: formData.model.trim(),
      manufacture_month: formData.manufacture_month ? parseInt(formData.manufacture_month) : null,
      manufacture_year: parseInt(formData.manufacture_year),
      purchase_date: formData.purchase_date,
      purchase_mileage: parseInt(formData.purchase_mileage) || 0,
      current_mileage: parseInt(formData.current_mileage) || parseInt(formData.purchase_mileage) || 0,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      vin: formData.vin.trim() || null
    }, editingCar)
    closeCarModal()
  }

  const openMaintenanceForm = (item?: MaintenanceType) => {
    if (item) {
      setEditingMaintenance(item)
      setMaintenanceForm({ date: item.date, mileage: item.mileage?.toString() || '', type: item.type, cost: item.cost?.toString() || '' })
    } else {
      setMaintenanceForm(initialMaintenanceForm)
    }
    setShowMaintenanceForm(true)
  }

  const resetMaintenanceForm = () => { setMaintenanceForm(initialMaintenanceForm); setEditingMaintenance(null); setShowMaintenanceForm(false) }

  const handleSaveMaintenance = async () => {
    if (!maintenanceForm.date || !maintenanceForm.type) return
    await saveMaintenance({
      date: maintenanceForm.date, type: maintenanceForm.type,
      mileage: maintenanceForm.mileage ? parseInt(maintenanceForm.mileage) : null,
      cost: maintenanceForm.cost ? parseFloat(maintenanceForm.cost) : null
    }, editingMaintenance?.id)
    resetMaintenanceForm()
  }

  const openFuelForm = (item?: FuelType) => {
    if (item) {
      setEditingFuel(item)
      setFuelForm({ date: item.date, mileage: item.mileage?.toString() || '', liters: item.liters?.toString() || '', price_per_liter: item.price_per_liter?.toString() || '', fuel_type: item.fuel_type })
    } else {
      setFuelForm(initialFuelForm)
    }
    setShowFuelForm(true)
  }

  const resetFuelForm = () => { setFuelForm(initialFuelForm); setEditingFuel(null); setShowFuelForm(false) }

  const handleSaveFuel = async () => {
    if (!fuelForm.date) return
    const liters = fuelForm.liters ? parseFloat(fuelForm.liters) : null
    const pricePerLiter = fuelForm.price_per_liter ? parseFloat(fuelForm.price_per_liter) : null
    await saveFuel({
      date: fuelForm.date, fuel_type: fuelForm.fuel_type,
      mileage: fuelForm.mileage ? parseInt(fuelForm.mileage) : null,
      liters, price_per_liter: pricePerLiter,
      total_cost: liters && pricePerLiter ? liters * pricePerLiter : null
    }, editingFuel?.id)
    resetFuelForm()
  }

  const openExpenseForm = (item?: ExpenseType) => {
    if (item) {
      setEditingExpense(item)
      setExpenseForm({ date: item.date, category: item.category, description: item.description || '', cost: item.cost.toString() })
    } else {
      setExpenseForm(initialExpenseForm)
    }
    setShowExpenseForm(true)
  }

  const resetExpenseForm = () => { setExpenseForm(initialExpenseForm); setEditingExpense(null); setShowExpenseForm(false) }

  const handleSaveExpense = async () => {
    if (!expenseForm.date || !expenseForm.category || !expenseForm.cost) return
    await saveExpense({
      date: expenseForm.date, category: expenseForm.category,
      description: expenseForm.description || null, cost: parseFloat(expenseForm.cost)
    }, editingExpense?.id)
    resetExpenseForm()
  }

  const openPartForm = (item?: PartType) => {
    if (item) {
      setEditingPart(item)
      setPartForm({ category: item.category, name: item.name, part_number: item.part_number, notes: item.notes || '' })
    } else {
      setPartForm(initialPartForm)
    }
    setShowPartForm(true)
  }

  const resetPartForm = () => { setPartForm(initialPartForm); setEditingPart(null); setShowPartForm(false) }

  const handleSavePart = async () => {
    if (!partForm.category || !partForm.name || !partForm.part_number) return
    await savePart({ category: partForm.category, name: partForm.name, part_number: partForm.part_number, notes: partForm.notes || null }, editingPart?.id)
    resetPartForm()
  }

  if (loading) return <div className="car-page"><div className="loading">Загрузка...</div></div>

  return (
    <div className="car-page">
      <div className="car-header">
        <h1>Машина</h1>
        <button className="add-car-btn" onClick={openCarModal}><Plus size={20} /><span>Добавить авто</span></button>
      </div>

      {cars.length === 0 ? (
        <div className="no-cars">
          <Car size={48} strokeWidth={1} />
          <p>Нет добавленных автомобилей</p>
          <button className="add-first-car-btn" onClick={openCarModal}>Добавить автомобиль</button>
        </div>
      ) : (
        <>
          <div className="car-selector" onClick={() => setShowCarSelect(!showCarSelect)}>
            <div className="selected-car">
              <Car size={20} />
              <span>{selectedCar?.brand} {selectedCar?.model} <span className="car-age-small">({selectedCar && calcAge(selectedCar.manufacture_year, selectedCar.manufacture_month)})</span></span>
              <ChevronDown size={18} className={showCarSelect ? 'rotated' : ''} />
            </div>
            {showCarSelect && (
              <div className="car-dropdown">
                {cars.map(car => (
                  <div key={car.id} className={`car-option ${selectedCar?.id === car.id ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedCar(car); setShowCarSelect(false) }}>
                    <span>{car.brand} {car.model} <span className="car-age-small">({calcAge(car.manufacture_year, car.manufacture_month)})</span></span>
                    <div className="car-option-actions">
                      <button onClick={(e) => { e.stopPropagation(); openEditCarModal(car) }}><Edit2 size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteCar(car.id) }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCar && (
            <>
              <div className="car-tabs">
                <button className={`car-tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
                  <BarChart3 size={18} /><span>Сводная</span>
                </button>
                <button className={`car-tab ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => setActiveTab('maintenance')}>
                  <Wrench size={18} /><span>ТО</span>
                </button>
                <button className={`car-tab ${activeTab === 'fuel' ? 'active' : ''}`} onClick={() => setActiveTab('fuel')}>
                  <Fuel size={18} /><span>Бензин</span>
                </button>
                <button className={`car-tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>
                  <Receipt size={18} /><span>Допы</span>
                </button>
                <button className={`car-tab ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
                  <Info size={18} /><span>Инфо</span>
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'summary' && (
                  <SummaryTab selectedCar={selectedCar} maintenance={maintenance} fuel={fuel} expenses={expenses} chartTab={chartTab} setChartTab={setChartTab} />
                )}
                {activeTab === 'maintenance' && (
                  <MaintenanceTab maintenance={maintenance} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy}
                    showForm={showMaintenanceForm} form={maintenanceForm} setForm={setMaintenanceForm} editing={editingMaintenance}
                    onOpenForm={openMaintenanceForm} onResetForm={resetMaintenanceForm} onSave={handleSaveMaintenance} onDelete={deleteMaintenance} />
                )}
                {activeTab === 'fuel' && (
                  <FuelTab selectedCar={selectedCar} fuel={fuel} maintenance={[]} expenses={[]} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy}
                    showForm={showFuelForm} form={fuelForm} setForm={setFuelForm} editing={editingFuel}
                    onOpenForm={openFuelForm} onResetForm={resetFuelForm} onSave={handleSaveFuel} onDelete={deleteFuel} />
                )}
                {activeTab === 'expenses' && (
                  <ExpensesTab expenses={expenses} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy}
                    showForm={showExpenseForm} form={expenseForm} setForm={setExpenseForm} editing={editingExpense}
                    onOpenForm={openExpenseForm} onResetForm={resetExpenseForm} onSave={handleSaveExpense} onDelete={deleteExpense} />
                )}
                {activeTab === 'info' && (
                  <InfoTab parts={parts} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                    showForm={showPartForm} form={partForm} setForm={setPartForm} editing={editingPart}
                    onOpenForm={openPartForm} onResetForm={resetPartForm} onSave={handleSavePart} onDelete={deletePart} onImport={importParts} />
                )}
              </div>
            </>
          )}
        </>
      )}

      {showCarModal && (
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
                  <input type="text" placeholder="Toyota" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Модель *</label>
                  <input type="text" placeholder="Camry" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Месяц выпуска</label>
                  <select value={formData.manufacture_month} onChange={e => setFormData({ ...formData, manufacture_month: e.target.value })}>
                    <option value="">—</option>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Год выпуска *</label>
                  <input type="number" placeholder="2020" value={formData.manufacture_year} onChange={e => setFormData({ ...formData, manufacture_year: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Дата покупки *</label>
                <input type="date" value={formData.purchase_date} onChange={e => setFormData({ ...formData, purchase_date: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Пробег при покупке (км)</label>
                  <input type="number" placeholder="50000" value={formData.purchase_mileage} onChange={e => setFormData({ ...formData, purchase_mileage: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Текущий пробег (км)</label>
                  <input type="number" placeholder="55000" value={formData.current_mileage} onChange={e => setFormData({ ...formData, current_mileage: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Стоимость покупки (₽)</label>
                <input type="number" placeholder="1500000" value={formData.purchase_price} onChange={e => setFormData({ ...formData, purchase_price: e.target.value })} />
              </div>
              <div className="form-group">
                <label>VIN</label>
                <input type="text" placeholder="JTDKN3DU5A0123456" value={formData.vin} onChange={e => setFormData({ ...formData, vin: e.target.value.toUpperCase() })} maxLength={17} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeCarModal}>Отмена</button>
              <button className="btn-save" onClick={handleSaveCar} disabled={!formData.brand || !formData.model || !formData.manufacture_year || !formData.purchase_date}>
                {editingCar ? 'Сохранить' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
