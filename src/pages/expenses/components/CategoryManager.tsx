import { useMemo, useState } from 'react'
import { Link2, Plus } from 'lucide-react'
import type { ExpenseCategoryMapping, ExpenseUserCategory } from '../types'

const DEFAULT_COLOR = '#64748B'

interface Props {
  categories: ExpenseUserCategory[]
  mappings: ExpenseCategoryMapping[]
  bankCategories: string[]
  onCreate: (name: string, color: string) => Promise<unknown>
  onUpdate: (id: string, patch: Partial<ExpenseUserCategory>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMap: (bankCategory: string, targetCategoryId: string | null) => Promise<void>
  onError: (message: string | null) => void
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function CategoryManager({ categories, mappings, bankCategories, onCreate, onUpdate, onDelete, onMap, onError }: Props) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingColor, setEditingColor] = useState(DEFAULT_COLOR)
  const [mappingInProgress, setMappingInProgress] = useState<string | null>(null)

  const mappingByBankCategory = useMemo(
    () => new Map(mappings.map(mapping => [mapping.bank_category, mapping.target_category_id])),
    [mappings]
  )

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingColor(DEFAULT_COLOR)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    onError(null)
    try {
      await onCreate(newName, newColor)
      setNewName('')
      setNewColor(DEFAULT_COLOR)
    } catch (err) {
      onError(errorText(err, 'Не удалось добавить категорию'))
    }
  }

  const handleSave = async () => {
    if (!editingId || !editingName.trim()) return
    onError(null)
    try {
      await onUpdate(editingId, { name: editingName.trim(), color: editingColor })
      cancelEdit()
    } catch (err) {
      onError(errorText(err, 'Не удалось обновить категорию'))
    }
  }

  const handleDelete = async (id: string) => {
    onError(null)
    try {
      await onDelete(id)
      if (editingId === id) cancelEdit()
    } catch (err) {
      onError(errorText(err, 'Не удалось удалить категорию'))
    }
  }

  const handleMap = async (bankCategory: string, targetCategoryId: string) => {
    onError(null)
    setMappingInProgress(bankCategory)
    try {
      await onMap(bankCategory, targetCategoryId || null)
    } catch (err) {
      onError(errorText(err, 'Не удалось обновить маппинг'))
    } finally {
      setMappingInProgress(null)
    }
  }

  return (
    <section className="management-grid">
      <article className="section-card">
        <h3>Мои категории</h3>

        <div className="category-create-row">
          <input type="text" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Новая категория" />
          <input type="color" value={newColor} onChange={event => setNewColor(event.target.value)} title="Цвет" />
          <button className="action-btn" onClick={handleCreate}>
            <Plus size={16} strokeWidth={1.5} />
            Добавить
          </button>
        </div>

        <div className="category-list">
          {categories.length === 0 ? (
            <div className="empty-state">Категории ещё не созданы</div>
          ) : categories.map(category => (
            <div key={category.id} className="category-row">
              {editingId === category.id ? (
                <>
                  <input type="text" value={editingName} onChange={event => setEditingName(event.target.value)} />
                  <input type="color" value={editingColor} onChange={event => setEditingColor(event.target.value)} />
                  <button className="action-btn" onClick={handleSave}>Сохранить</button>
                  <button className="action-btn ghost" onClick={cancelEdit}>Отмена</button>
                </>
              ) : (
                <>
                  <span className="category-color" style={{ backgroundColor: category.color }} />
                  <span className="category-name">{category.name}</span>
                  <button
                    className="action-btn ghost"
                    onClick={() => {
                      setEditingId(category.id)
                      setEditingName(category.name)
                      setEditingColor(category.color)
                    }}
                  >
                    Изменить
                  </button>
                  <button className="action-btn danger" onClick={() => handleDelete(category.id)}>Удалить</button>
                </>
              )}
            </div>
          ))}
        </div>
      </article>

      <article className="section-card">
        <h3 className="with-icon">
          <Link2 size={16} strokeWidth={1.5} />
          Категории банка → мои
        </h3>

        <div className="mapping-list">
          {bankCategories.length === 0 ? (
            <div className="empty-state">Сначала импортируйте выписку</div>
          ) : bankCategories.map(bankCategory => (
            <div key={bankCategory} className="mapping-row">
              <span className="mapping-name">{bankCategory}</span>
              <select
                value={mappingByBankCategory.get(bankCategory) || ''}
                onChange={event => handleMap(bankCategory, event.target.value)}
                disabled={mappingInProgress === bankCategory}
              >
                <option value="">Без маппинга</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
