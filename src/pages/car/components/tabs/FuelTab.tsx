import { Plus, Search, ArrowUpDown, Edit2, Trash2, Fuel } from 'lucide-react'
import type { CarType, FuelType, FuelFormData, SortBy } from '../../types'
import { FUEL_TYPES } from '../../constants'
import { formatPrice, formatMileage, sortItems, calculateTotals } from '../../utils'

interface Props {
  selectedCar: CarType
  fuel: FuelType[]
  maintenance: never[]
  expenses: never[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  showForm: boolean
  form: FuelFormData
  setForm: (f: FuelFormData) => void
  editing: FuelType | null
  onOpenForm: (item?: FuelType) => void
  onResetForm: () => void
  onSave: () => void
  onDelete: (id: string) => void
}

export function FuelTab({
  selectedCar, fuel, searchQuery, setSearchQuery, sortBy, setSortBy,
  showForm, form, setForm, editing, onOpenForm, onResetForm, onSave, onDelete
}: Props) {
  const totals = calculateTotals(selectedCar, [], fuel, [])
  const filtered = sortItems(
    fuel.filter(f => f.fuel_type.toLowerCase().includes(searchQuery.toLowerCase())),
    sortBy
  )

  return (
    <div className="fuel-tab">
      <div className="tab-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <button className="sort-btn" onClick={() => setSortBy(sortBy === 'date' ? 'cost' : 'date')}>
          <ArrowUpDown size={16} />
          <span>{sortBy === 'date' ? 'Дата' : 'Сумма'}</span>
        </button>
        <span className="stat-total">{formatPrice(totals.fuelTotal)}</span>
        {!showForm && (
          <button className="add-record-btn" onClick={() => onOpenForm()}>
            <Plus size={18} />
            <span>Добавить</span>
          </button>
        )}
      </div>
      {fuel.length > 0 && (
        <div className="fuel-stats">
          <div className="fuel-stat-item">
            <span className="fuel-stat-value">{totals.totalLiters.toFixed(1)} л</span>
            <span className="fuel-stat-label">Сожжено</span>
          </div>
          <div className="fuel-stat-item">
            <span className="fuel-stat-value">{formatMileage(totals.totalFuelKm)}</span>
            <span className="fuel-stat-label">Пройдено</span>
          </div>
          <div className="fuel-stat-item accent">
            <span className="fuel-stat-value">{totals.avgConsumption ? `${totals.avgConsumption} л` : '—'}</span>
            <span className="fuel-stat-label">Расход / 100 км</span>
          </div>
        </div>
      )}
      {showForm && (
        <div className="inline-form">
          <div className="inline-form-row">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="number" placeholder="Пробег" value={form.mileage} onChange={e => setForm({ ...form, mileage: e.target.value })} />
            <select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })}>
              {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="inline-form-row">
            <input type="number" step="0.01" placeholder="Литры" value={form.liters} onChange={e => setForm({ ...form, liters: e.target.value })} />
            <input type="number" step="0.01" placeholder="₽/литр" value={form.price_per_liter} onChange={e => setForm({ ...form, price_per_liter: e.target.value })} />
            <span className="calc-total">
              = {form.liters && form.price_per_liter ? formatPrice(parseFloat(form.liters) * parseFloat(form.price_per_liter)) : '—'}
            </span>
          </div>
          <div className="inline-form-actions">
            <button className="btn-cancel" onClick={onResetForm}>Отмена</button>
            <button className="btn-save" onClick={onSave} disabled={!form.date}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>
      )}
      {filtered.length === 0 && !showForm ? (
        <div className="empty-tab">
          <Fuel size={40} strokeWidth={1} />
          <p>{searchQuery ? 'Ничего не найдено' : 'Записи о заправках появятся здесь'}</p>
        </div>
      ) : (
        <div className="records-list">
          {filtered.map(item => (
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
                  <button onClick={() => onOpenForm(item)}><Edit2 size={14} /></button>
                  <button onClick={() => onDelete(item.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
