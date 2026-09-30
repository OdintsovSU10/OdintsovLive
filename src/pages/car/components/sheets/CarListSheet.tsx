import { Check, Plus } from 'lucide-react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { calcAge } from '../../../../lib/dateUtils'
import type { CarType } from '../../types'
import { formatMileage } from '../../utils/format'

interface Props {
  cars: CarType[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: () => void
}

export function CarListSheet({ cars, selectedId, onSelect, onAdd, onClose }: Props) {
  return (
    <BottomSheet
      title="Мои автомобили"
      onClose={onClose}
      footer={
        <button type="button" className="car-btn ghost grow" onClick={onAdd}>
          <Plus size={18} />
          <span>Добавить авто</span>
        </button>
      }
    >
      <ul className="car-menu-list">
        {cars.map(car => (
          <li key={car.id}>
            <button
              type="button"
              className={`car-menu-item ${car.id === selectedId ? 'active' : ''}`}
              aria-current={car.id === selectedId}
              onClick={() => onSelect(car.id)}
            >
              <span className="car-menu-text">
                <strong>{car.brand} {car.model}</strong>
                <span className="car-muted">
                  {calcAge(car.manufacture_year, car.manufacture_month)} · {formatMileage(car.current_mileage)}
                </span>
              </span>
              {car.id === selectedId && <Check size={20} aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
