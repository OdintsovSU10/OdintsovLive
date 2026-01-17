import { useState } from 'react'
import { Plus, Search, Edit2, Trash2, Info, ChevronDown, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { PartType, PartFormData } from '../../types'
import { PART_CATEGORIES } from '../../constants'

interface Props {
  parts: PartType[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  showForm: boolean
  form: PartFormData
  setForm: (f: PartFormData) => void
  editing: PartType | null
  onOpenForm: (item?: PartType) => void
  onResetForm: () => void
  onSave: () => void
  onDelete: (id: string) => void
  onImport: (parts: Partial<PartType>[]) => void
}

export function InfoTab({
  parts, searchQuery, setSearchQuery,
  showForm, form, setForm, editing, onOpenForm, onResetForm, onSave, onDelete, onImport
}: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

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
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      const partsToInsert = rows
        .slice(1)
        .filter((row: unknown[]) => row[0] && row[1] && row[2])
        .map((row: unknown[]) => ({
          category: String(row[0]).trim(),
          name: String(row[1]).trim(),
          part_number: String(row[2]).trim(),
          notes: row[3] ? String(row[3]).trim() : null
        }))

      if (partsToInsert.length > 0) {
        onImport(partsToInsert)
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const filteredParts = parts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.part_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="info-tab">
      <div className="tab-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <span className="stat-count">{parts.length} запчастей</span>
        {!showForm && (
          <>
            <label className="import-btn">
              <Upload size={18} />
              <span>Импорт</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} hidden />
            </label>
            <button className="add-record-btn" onClick={() => onOpenForm()}>
              <Plus size={18} />
              <span>Добавить</span>
            </button>
          </>
        )}
      </div>
      {showForm && (
        <div className="inline-form">
          <div className="inline-form-row">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">Категория</option>
              {PART_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="inline-form-row">
            <input type="text" placeholder="Артикул / код" value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} />
            <input type="text" placeholder="Заметка (необязательно)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="inline-form-actions">
            <button className="btn-cancel" onClick={onResetForm}>Отмена</button>
            <button className="btn-save" onClick={onSave} disabled={!form.category || !form.name || !form.part_number}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>
      )}
      {filteredParts.length === 0 && !showForm ? (
        <div className="empty-tab">
          <Info size={40} strokeWidth={1} />
          <p>{searchQuery ? 'Ничего не найдено' : 'Коды запчастей появятся здесь'}</p>
        </div>
      ) : (
        <div className="parts-list">
          {PART_CATEGORIES.map(category => {
            const categoryParts = filteredParts.filter(p => p.category === category)
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
                          <button onClick={() => onOpenForm(part)}><Edit2 size={14} /></button>
                          <button onClick={() => onDelete(part.id)}><Trash2 size={14} /></button>
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
  )
}
