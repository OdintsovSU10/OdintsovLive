import type { ChangeEvent } from 'react'
import { Camera, ImageOff, Loader2, Pencil, Trash2 } from 'lucide-react'
import { MONTHS } from '../../../../lib/constants'
import { calcAge } from '../../../../lib/dateUtils'
import type { CarPhoto, CarType } from '../../types'
import { formatDate } from '../../utils/dates'
import { formatMileage, formatRub } from '../../utils/format'
import { FramedPhoto } from '../FramedPhoto'

interface Props {
  car: CarType
  spentTotal: number
  photo: CarPhoto | null
  photoUploading: boolean
  onUploadPhoto: (file: File) => void
  onRemovePhoto: () => void
  onEdit: () => void
  onDelete: () => void
}

export function CarCard({ car, spentTotal, photo, photoUploading, onUploadPhoto, onRemovePhoto, onEdit, onDelete }: Props) {
  const made = car.manufacture_month ? `${MONTHS[car.manufacture_month - 1]} ${car.manufacture_year}` : String(car.manufacture_year)
  const rows: [string, string][] = [
    ['Выпуск', `${made} · ${calcAge(car.manufacture_year, car.manufacture_month)}`],
    ['Куплена', formatDate(car.purchase_date)],
    ['Пробег при покупке', formatMileage(car.purchase_mileage)],
    ['Текущий пробег', formatMileage(car.current_mileage)],
    ['Пройдено при мне', formatMileage(Math.max(0, car.current_mileage - car.purchase_mileage))],
    ['Цена покупки', car.purchase_price ? formatRub(car.purchase_price) : '—'],
    ['Расходы за всё время', formatRub(spentTotal)],
    ['Стоимость владения', formatRub((car.purchase_price || 0) + spentTotal)]
  ]

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUploadPhoto(file)
  }

  return (
    <article className="car-card car-info">
      <div className="car-card-header">
        <div>
          <h3>{car.brand} {car.model}</h3>
          {car.vin && <div className="car-vin">VIN {car.vin}</div>}
        </div>
        <div className="car-info-actions">
          <button type="button" className="car-icon-btn" onClick={onEdit} aria-label="Изменить авто">
            <Pencil size={18} />
          </button>
          <button type="button" className="car-icon-btn danger" onClick={onDelete} aria-label="Удалить авто">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className="car-info-photo">
        {photo && (
          <div className="car-info-photo-frame">
            <FramedPhoto src={photo.image} alt={`${car.brand} ${car.model}`} frame={photo.frame} />
          </div>
        )}
        <div className="car-info-photo-actions">
          <label className={`car-btn ghost car-file-btn ${photoUploading ? 'busy' : ''}`}>
            {photoUploading ? <Loader2 size={18} className="car-spin" /> : <Camera size={18} />}
            <span>{photoUploading ? 'Загружаю…' : photo ? 'Сменить фото' : 'Добавить фото'}</span>
            <input type="file" accept="image/*" onChange={handleFile} disabled={photoUploading} />
          </label>
          {photo && (
            <button type="button" className="car-btn danger" onClick={onRemovePhoto} disabled={photoUploading}>
              <ImageOff size={18} />
              <span>Удалить фото</span>
            </button>
          )}
        </div>
      </div>
      <dl className="car-info-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="car-info-item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
