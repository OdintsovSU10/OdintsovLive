import { Plus, Search, ArrowUpDown, Edit2, Trash2, Wrench } from 'lucide-react'
import type { MaintenanceType, MaintenanceFormData, SortBy } from '../../types'
import { formatPrice, formatMileage, sortItems } from '../../utils'

interface Props {
  maintenance: MaintenanceType[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  showForm: boolean
  form: MaintenanceFormData
  setForm: (f: MaintenanceFormData) => void
  editing: MaintenanceType | null
  onOpenForm: (item?: MaintenanceType) => void
  onResetForm: () => void
  onSave: () => void
  onDelete: (id: string) => void
}

export function MaintenanceTab({
  maintenance, searchQuery, setSearchQuery, sortBy, setSortBy,
  showForm, form, setForm, editing, onOpenForm, onResetForm, onSave, onDelete
}: Props) {
  const maintenanceTotal = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0)
  const filtered = sortItems(
    maintenance.filter(m => m.type.toLowerCase().includes(searchQuery.toLowerCase())),
    sortBy
  )

  return (
    <div className="maintenance-tab">
      <div className="tab-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <button className="sort-btn" onClick={() => setSortBy(sortBy === 'date' ? 'cost' : 'date')}>
          <ArrowUpDown size={16} />
          <span>{sortBy === 'date' ? 'Дата' : 'Сумма'}</span>
        </button>
        <span className="stat-total">{formatPrice(maintenanceTotal)}</span>
        {!showForm && (
          <button className="add-record-btn" onClick={() => onOpenForm()}>
            <Plus size={18} />
            <span>Добавить</span>
          </button>
        )}
      </div>
      {showForm && (
        <div className="inline-form">
          <div className="inline-form-row">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="number" placeholder="Пробег" value={form.mileage} onChange={e => setForm({ ...form, mileage: e.target.value })} />
            <input type="text" placeholder="Тип работ" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} />
            <input type="number" placeholder="Стоимость" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div className="inline-form-actions">
            <button className="btn-cancel" onClick={onResetForm}>Отмена</button>
            <button className="btn-save" onClick={onSave} disabled={!form.date || !form.type}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>
      )}
      {filtered.length === 0 && !showForm ? (
        <div className="empty-tab">
          <Wrench size={40} strokeWidth={1} />
          <p>{searchQuery ? 'Ничего не найдено' : 'Записи о ТО появятся здесь'}</p>
        </div>
      ) : (
        <div className="records-list">
          {filtered.map(item => (
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
