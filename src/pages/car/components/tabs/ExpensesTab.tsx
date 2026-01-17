import { Plus, Search, ArrowUpDown, Edit2, Trash2, Receipt } from 'lucide-react'
import type { ExpenseType, ExpenseFormData, SortBy } from '../../types'
import { EXPENSE_CATEGORIES } from '../../constants'
import { formatPrice, sortItems } from '../../utils'

interface Props {
  expenses: ExpenseType[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  showForm: boolean
  form: ExpenseFormData
  setForm: (f: ExpenseFormData) => void
  editing: ExpenseType | null
  onOpenForm: (item?: ExpenseType) => void
  onResetForm: () => void
  onSave: () => void
  onDelete: (id: string) => void
}

export function ExpensesTab({
  expenses, searchQuery, setSearchQuery, sortBy, setSortBy,
  showForm, form, setForm, editing, onOpenForm, onResetForm, onSave, onDelete
}: Props) {
  const expensesTotal = expenses.reduce((sum, e) => sum + (e.cost || 0), 0)
  const filtered = sortItems(
    expenses.filter(e =>
      e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    ),
    sortBy
  )

  return (
    <div className="expenses-tab">
      <div className="tab-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <button className="sort-btn" onClick={() => setSortBy(sortBy === 'date' ? 'cost' : 'date')}>
          <ArrowUpDown size={16} />
          <span>{sortBy === 'date' ? 'Дата' : 'Сумма'}</span>
        </button>
        <span className="stat-total">{formatPrice(expensesTotal)}</span>
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
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">Категория</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" placeholder="Стоимость" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div className="inline-form-row">
            <input type="text" placeholder="Описание (необязательно)" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 1 }} />
          </div>
          <div className="inline-form-actions">
            <button className="btn-cancel" onClick={onResetForm}>Отмена</button>
            <button className="btn-save" onClick={onSave} disabled={!form.date || !form.category || !form.cost}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>
      )}
      {filtered.length === 0 && !showForm ? (
        <div className="empty-tab">
          <Receipt size={40} strokeWidth={1} />
          <p>{searchQuery ? 'Ничего не найдено' : 'Дополнительные расходы появятся здесь'}</p>
        </div>
      ) : (
        <div className="records-list">
          {filtered.map(item => (
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
