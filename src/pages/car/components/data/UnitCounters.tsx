import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ServiceUnitType } from '../../types'
import { formatDayShort } from '../../utils/dates'
import { formatMileage } from '../../utils/format'
import type { UnitCounter } from '../../utils/serviceDue'

interface Props {
  counters: UnitCounter[]
  onAdd?: () => void
  onEdit?: (unit: ServiceUnitType) => void
  onDelete?: (unit: ServiceUnitType) => void
}

// Накопительные счётчики агрегатов. Без обработчиков — только чтение (вкладка «Обзор»)
export function UnitCounters({ counters, onAdd, onEdit, onDelete }: Props) {
  return (
    <article className="car-card car-units">
      <div className="car-card-header">
        <h3>Пробег с замены</h3>
        {onAdd && (
          <button type="button" className="car-btn ghost" onClick={onAdd}>
            <Plus size={18} />
            <span>Добавить</span>
          </button>
        )}
      </div>

      {counters.length === 0 ? (
        <p className="car-muted">
          Добавьте агрегат — форсунки, масло CVT — и пробег, на котором его меняли. Новую замену отмечайте в записи ТО.
        </p>
      ) : (
        <ul className="car-units-list">
          {counters.map(({ unit, replacedAt, date, kmSince }) => (
            <li key={unit.id} className="car-unit">
              <div className="car-unit-main">
                <span className="car-unit-name">{unit.name}</span>
                <span className="car-unit-note">
                  {replacedAt !== null
                    ? `замена на ${formatMileage(replacedAt)}${date ? ` · ${formatDayShort(date, true)}` : ''}`
                    : 'пробег замены не указан'}
                </span>
              </div>
              <span className="car-unit-value">{kmSince !== null ? formatMileage(kmSince) : '—'}</span>
              {onEdit && (
                <button type="button" className="car-icon-btn" onClick={() => onEdit(unit)} aria-label={`Изменить ${unit.name}`}>
                  <Pencil size={16} />
                </button>
              )}
              {onDelete && (
                <button type="button" className="car-icon-btn danger" onClick={() => onDelete(unit)} aria-label={`Удалить ${unit.name}`}>
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
