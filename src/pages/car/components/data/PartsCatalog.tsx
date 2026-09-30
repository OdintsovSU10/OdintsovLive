import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ChevronDown, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PART_CATEGORIES } from '../../constants'
import type { PartType } from '../../types'

interface Props {
  parts: PartType[]
  onAdd: () => void
  onEdit: (part: PartType) => void
  onDelete: (part: PartType) => void
  onImport: (rows: Omit<PartType, 'id' | 'car_id'>[]) => void
}

// Excel: категория, название, артикул, заметка; первая строка — заголовки
function parseSheet(buffer: ArrayBuffer): Omit<PartType, 'id' | 'car_id'>[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  return rows
    .slice(1)
    .filter(row => row[0] && row[1] && row[2])
    .map(row => ({
      category: String(row[0]).trim(),
      name: String(row[1]).trim(),
      part_number: String(row[2]).trim(),
      notes: row[3] ? String(row[3]).trim() : null
    }))
}

export function PartsCatalog({ parts, onAdd, onEdit, onDelete, onImport }: Props) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return parts
    return parts.filter(part =>
      `${part.name} ${part.part_number} ${part.category} ${part.notes ?? ''}`.toLowerCase().includes(needle))
  }, [parts, query])

  // Сначала стандартные категории, затем любые из импорта — ничего не теряется
  const groups = useMemo(() => {
    const extra = Array.from(new Set(filtered.map(part => part.category))).filter(category => !PART_CATEGORIES.includes(category))
    return [...PART_CATEGORIES, ...extra]
      .map(category => ({ category, items: filtered.filter(part => part.category === category) }))
      .filter(group => group.items.length > 0)
  }, [filtered])

  const toggle = (category: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    onImport(parseSheet(await file.arrayBuffer()))
  }

  return (
    <article className="car-card car-parts">
      <div className="car-card-header">
        <h3>Запчасти и коды</h3>
        <span className="car-muted">{parts.length}</span>
      </div>

      <div className="car-parts-tools">
        <label className="car-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="Название или артикул" aria-label="Поиск запчастей"
            value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <label className="car-btn ghost car-file-btn">
          <Upload size={18} />
          <span>Excel</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
        </label>
        <button type="button" className="car-btn primary" onClick={onAdd}>
          <Plus size={18} />
          <span>Добавить</span>
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="car-muted">{query ? 'Ничего не найдено' : 'Коды запчастей появятся здесь. Импорт: категория, название, артикул, заметка.'}</p>
      ) : (
        <div className="car-parts-groups">
          {groups.map(({ category, items }) => {
            const isOpen = Boolean(query) || expanded.has(category)
            return (
              <section key={category} className="car-parts-group">
                <button type="button" className="car-parts-head" aria-expanded={isOpen} onClick={() => toggle(category)}>
                  <ChevronDown size={18} className={isOpen ? 'open' : ''} />
                  <span>{category}</span>
                  <span className="car-parts-count">{items.length}</span>
                </button>
                {isOpen && (
                  <ul className="car-parts-list">
                    {items.map(part => (
                      <li key={part.id} className="car-part">
                        <div className="car-part-main">
                          <span className="car-part-name">{part.name}</span>
                          <span className="car-part-number">{part.part_number}</span>
                          {part.notes && <span className="car-part-notes">{part.notes}</span>}
                        </div>
                        <button type="button" className="car-icon-btn" onClick={() => onEdit(part)} aria-label={`Изменить ${part.name}`}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="car-icon-btn danger" onClick={() => onDelete(part)} aria-label={`Удалить ${part.name}`}>
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </article>
  )
}
