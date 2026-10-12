import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { resizeImage } from '../../rent/rentUtils'
import { DEFAULT_PHOTO_FRAME } from '../constants'
import type { CarPhoto, PhotoFrame } from '../types'

// Обложке хватает 1280 px по длинной стороне: ~150–250 КБ вместо мегабайтов оригинала
const PHOTO_MAX_SIDE = 1280
const PHOTO_QUALITY = 0.8

// Обложка лежит в localStorage: по сети при открытии идут только кадр и метка версии,
// сама картинка скачивается заново, лишь когда updated_at в БД другой
const CACHE_PREFIX = 'car:photo:'

interface CachedPhoto extends CarPhoto {
  updatedAt: string
}

interface PhotoMeta {
  updated_at: string | null
  focus_x: number | null
  focus_y: number | null
  zoom: number | null
}

function toFrame(meta: PhotoMeta): PhotoFrame {
  return {
    x: meta.focus_x ?? DEFAULT_PHOTO_FRAME.x,
    y: meta.focus_y ?? DEFAULT_PHOTO_FRAME.y,
    zoom: meta.zoom ?? DEFAULT_PHOTO_FRAME.zoom
  }
}

function readCache(carId: string): CachedPhoto | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + carId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedPhoto>
    if (typeof parsed.image !== 'string' || typeof parsed.updatedAt !== 'string') return null
    return { image: parsed.image, updatedAt: parsed.updatedAt, frame: parsed.frame ?? DEFAULT_PHOTO_FRAME }
  } catch {
    return null
  }
}

function writeCache(carId: string, photo: CachedPhoto | null) {
  try {
    if (photo) localStorage.setItem(CACHE_PREFIX + carId, JSON.stringify(photo))
    else localStorage.removeItem(CACHE_PREFIX + carId)
  } catch {
    // нет места или приватный режим — фото просто скачается в следующий раз
  }
}

// БД отдаёт время с микросекундами и смещением, браузер пишет ISO с Z — сравниваем моменты
function sameMoment(a: string, b: string | null): boolean {
  return b !== null && Date.parse(a) === Date.parse(b)
}

export function useCarPhoto(carId: string | null) {
  const [photo, setPhoto] = useState<CarPhoto | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    if (!carId) {
      setPhoto(null)
      setLoading(false)
      return
    }

    const cached = readCache(carId)
    setPhoto(cached ? { image: cached.image, frame: cached.frame } : null)
    setLoading(!cached)

    const load = async () => {
      const { data, error } = await supabase
        .from('car_photos')
        .select('updated_at, focus_x, focus_y, zoom')
        .eq('car_id', carId)
        .maybeSingle()
      if (request !== requestRef.current) return
      // Сеть подвела — остаёмся на кэше
      if (error) return setLoading(false)

      const meta = data as PhotoMeta | null
      if (!meta) {
        writeCache(carId, null)
        setPhoto(null)
        return setLoading(false)
      }

      const frame = toFrame(meta)
      let image = cached && sameMoment(cached.updatedAt, meta.updated_at) ? cached.image : null
      if (!image) {
        const full = await supabase.from('car_photos').select('image').eq('car_id', carId).maybeSingle()
        if (request !== requestRef.current) return
        if (full.error) return setLoading(false)
        image = (full.data as { image: string } | null)?.image ?? null
      }

      if (image && meta.updated_at) writeCache(carId, { image, frame, updatedAt: meta.updated_at })
      setPhoto(image ? { image, frame } : null)
      setLoading(false)
    }
    void load()
  }, [carId])

  // Сжатие в браузере, в БД — только готовый JPEG; кадр новой фотки — по умолчанию
  const savePhoto = useCallback(async (file: File): Promise<boolean> => {
    if (!carId) return false
    setUploading(true)
    try {
      const image = `data:image/jpeg;base64,${await resizeImage(file, PHOTO_MAX_SIDE, PHOTO_QUALITY)}`
      const frame = DEFAULT_PHOTO_FRAME
      const updatedAt = new Date().toISOString()
      const { error } = await supabase.from('car_photos').upsert({
        car_id: carId,
        image,
        focus_x: frame.x,
        focus_y: frame.y,
        zoom: frame.zoom,
        updated_at: updatedAt
      })
      if (error) return false
      writeCache(carId, { image, frame, updatedAt })
      setPhoto({ image, frame })
      return true
    } catch {
      return false
    } finally {
      setUploading(false)
    }
  }, [carId])

  const saveFrame = useCallback(async (frame: PhotoFrame): Promise<boolean> => {
    if (!carId) return false
    const updatedAt = new Date().toISOString()
    const { error } = await supabase
      .from('car_photos')
      .update({ focus_x: frame.x, focus_y: frame.y, zoom: frame.zoom, updated_at: updatedAt })
      .eq('car_id', carId)
    if (error) return false
    const cached = readCache(carId)
    if (cached) writeCache(carId, { ...cached, frame, updatedAt })
    setPhoto(prev => (prev ? { ...prev, frame } : prev))
    return true
  }, [carId])

  const removePhoto = useCallback(async (): Promise<boolean> => {
    if (!carId) return false
    const { error } = await supabase.from('car_photos').delete().eq('car_id', carId)
    if (error) return false
    writeCache(carId, null)
    setPhoto(null)
    return true
  }, [carId])

  return { photo, loading, uploading, savePhoto, saveFrame, removePhoto }
}
