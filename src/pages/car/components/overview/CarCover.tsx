import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react'
import { Camera, Crop, Loader2, Move, ZoomIn, ZoomOut } from 'lucide-react'
import { calcAge } from '../../../../lib/dateUtils'
import { DEFAULT_PHOTO_FRAME, MAX_PHOTO_ZOOM } from '../../constants'
import type { CarPhoto, CarType, PhotoFrame } from '../../types'
import { formatMileage } from '../../utils/format'
import { FramedPhoto } from '../FramedPhoto'

interface Props {
  car: CarType
  photo: CarPhoto | null
  loading: boolean
  uploading: boolean
  onUpload: (file: File) => void
  onSaveFrame: (frame: PhotoFrame) => Promise<boolean>
}

const KEY_STEP_PX = 16
const ZOOM_STEP = 0.1

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Обложка «Обзора»: фото с названием поверх; «Кадр» — перетащить фото и выбрать масштаб
export function CarCover({ car, photo, loading, uploading, onUpload, onSaveFrame }: Props) {
  const [draft, setDraft] = useState<PhotoFrame | null>(null)
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ x: number; y: number; frame: PhotoFrame } | null>(null)

  // Другая машина — выходим из настройки кадра
  useEffect(() => setDraft(null), [car.id])

  // В режиме кадра фокус на обложке — сразу работают стрелки и Esc
  const isEditing = draft !== null
  useEffect(() => {
    if (isEditing) sectionRef.current?.focus()
  }, [isEditing])

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

  const frame = draft ?? photo.frame

  // Сколько пикселей фото уходит за края при масштабе zoom: сдвиг на столько — фокус от 0 до 1
  const hiddenSize = (zoom: number) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return { x: 0, y: 0 }
    const cover = Math.max(img.clientWidth / img.naturalWidth, img.clientHeight / img.naturalHeight)
    return {
      x: img.naturalWidth * cover * zoom - img.clientWidth,
      y: img.naturalHeight * cover * zoom - img.clientHeight
    }
  }

  // Фото «идёт за пальцем»: сдвиг вправо открывает левую часть
  const moveBy = (from: PhotoFrame, dx: number, dy: number): PhotoFrame => {
    const hidden = hiddenSize(from.zoom)
    return {
      ...from,
      x: hidden.x > 1 ? clamp(from.x - dx / hidden.x, 0, 1) : from.x,
      y: hidden.y > 1 ? clamp(from.y - dy / hidden.y, 0, 1) : from.y
    }
  }

  const setZoom = (zoom: number) => setDraft(prev => prev && { ...prev, zoom: clamp(zoom, 1, MAX_PHOTO_ZOOM) })

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!isEditing) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, frame }
  }

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setDraft(moveBy(drag.frame, event.clientX - drag.x, event.clientY - drag.y))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const ok = await onSaveFrame(draft)
    setSaving(false)
    if (ok) setDraft(null)
  }

  // Клавиатура: стрелки двигают кадр, +/− — масштаб, Enter — сохранить, Esc — отмена
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isEditing) return
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP_PX, 0],
      ArrowRight: [-KEY_STEP_PX, 0],
      ArrowUp: [0, KEY_STEP_PX],
      ArrowDown: [0, -KEY_STEP_PX]
    }
    if (moves[event.key]) {
      event.preventDefault()
      setDraft(moveBy(frame, ...moves[event.key]))
    } else if (event.key === '+' || event.key === '=') {
      setZoom(frame.zoom + ZOOM_STEP)
    } else if (event.key === '-') {
      setZoom(frame.zoom - ZOOM_STEP)
    } else if (event.key === 'Enter') {
      void save()
    } else if (event.key === 'Escape') {
      setDraft(null)
    }
  }

  return (
    <div className="car-cover-wrap">
      <section
        ref={sectionRef}
        className={`car-cover ${isEditing ? 'editing' : ''}`}
        aria-label={isEditing ? 'Кадр обложки: перетащите фото, стрелки — сдвиг, плюс и минус — масштаб' : name}
        tabIndex={isEditing ? 0 : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      >
        <FramedPhoto ref={imgRef} src={photo.image} alt={name} frame={frame} />

        {isEditing ? (
          <div className="car-cover-hint" aria-hidden="true">
            <Move size={16} />
            Перетащите фото, чтобы выбрать кадр
          </div>
        ) : (
          <>
            <div className="car-cover-scrim" aria-hidden="true" />
            <div className="car-cover-info">
              <h2>{name}</h2>
              <p>{calcAge(car.manufacture_year, car.manufacture_month)} · {formatMileage(car.current_mileage)}</p>
            </div>
            <div className="car-cover-actions">
              <button type="button" className="car-cover-btn" onClick={() => setDraft(photo.frame)} aria-label="Выбрать кадр" title="Выбрать кадр">
                <Crop size={20} />
              </button>
              <label className={`car-cover-btn ${uploading ? 'busy' : ''}`} aria-label="Сменить фото" title="Сменить фото">
                {uploading ? <Loader2 size={20} className="car-spin" /> : <Camera size={20} />}
                <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
              </label>
            </div>
          </>
        )}
      </section>

      {isEditing && (
        <div className="car-cover-tools">
          <label className="car-cover-zoom">
            <ZoomOut size={18} aria-hidden="true" />
            <input
              type="range"
              min={1}
              max={MAX_PHOTO_ZOOM}
              step={0.05}
              value={frame.zoom}
              onChange={e => setZoom(Number(e.target.value))}
              aria-label="Масштаб"
            />
            <ZoomIn size={18} aria-hidden="true" />
          </label>
          <div className="car-cover-tools-actions">
            <button type="button" className="car-btn ghost" onClick={() => setDraft(DEFAULT_PHOTO_FRAME)} disabled={saving}>
              Сбросить
            </button>
            <button type="button" className="car-btn ghost" onClick={() => setDraft(null)} disabled={saving}>
              Отмена
            </button>
            <button type="button" className="car-btn primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Сохраняю…' : 'Готово'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
