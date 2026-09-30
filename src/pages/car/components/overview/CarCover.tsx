import type { ChangeEvent } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { calcAge } from '../../../../lib/dateUtils'
import type { CarType } from '../../types'
import { formatMileage } from '../../utils/format'

interface Props {
  car: CarType
  photo: string | null
  loading: boolean
  uploading: boolean
  onUpload: (file: File) => void
}

// Обложка «Обзора»: фото машины с названием поверх; без фото — компактная кнопка добавления
export function CarCover({ car, photo, loading, uploading, onUpload }: Props) {
  if (loading) return null

  const name = `${car.brand} ${car.model}`
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(file)
  }

  if (!photo) {
    return (
      <label className={`car-cover-empty ${uploading ? 'busy' : ''}`}>
        {uploading ? <Loader2 size={20} className="car-spin" /> : <Camera size={20} />}
        <span>{uploading ? 'Загружаю фото…' : 'Добавить фото машины'}</span>
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
      </label>
    )
  }

  return (
    <section className="car-cover" aria-label={name}>
      <img src={photo} alt={name} />
      <div className="car-cover-scrim" aria-hidden="true" />
      <div className="car-cover-info">
        <h2>{name}</h2>
        <p>{calcAge(car.manufacture_year, car.manufacture_month)} · {formatMileage(car.current_mileage)}</p>
      </div>
      <label className={`car-cover-btn ${uploading ? 'busy' : ''}`} aria-label="Сменить фото" title="Сменить фото">
        {uploading ? <Loader2 size={20} className="car-spin" /> : <Camera size={20} />}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
      </label>
    </section>
  )
}
