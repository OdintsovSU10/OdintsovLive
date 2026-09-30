import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { resizeImage } from '../../rent/rentUtils'
import { DEFAULT_PHOTO_FRAME } from '../constants'
import type { CarPhoto, PhotoFrame } from '../types'

// Обложке хватает 1280 px по длинной стороне: ~150–250 КБ вместо мегабайтов оригинала
const PHOTO_MAX_SIDE = 1280
const PHOTO_QUALITY = 0.8

interface PhotoRow {
  image: string
  focus_x: number | null
  focus_y: number | null
  zoom: number | null
}

function toPhoto(row: PhotoRow | null): CarPhoto | null {
  if (!row) return null
  return {
    image: row.image,
    frame: {
      x: row.focus_x ?? DEFAULT_PHOTO_FRAME.x,
      y: row.focus_y ?? DEFAULT_PHOTO_FRAME.y,
      zoom: row.zoom ?? DEFAULT_PHOTO_FRAME.zoom
    }
  }
}

export function useCarPhoto(carId: string | null) {
  const [photo, setPhoto] = useState<CarPhoto | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    setPhoto(null)
    if (!carId) {
      setLoading(false)
      return
    }

    setLoading(true)
    void supabase
      .from('car_photos')
      .select('image, focus_x, focus_y, zoom')
      .eq('car_id', carId)
      .maybeSingle()
      .then(({ data }) => {
        if (request !== requestRef.current) return
        setPhoto(toPhoto(data))
        setLoading(false)
      })
  }, [carId])

  // Сжатие в браузере, в БД — только готовый JPEG; кадр новой фотки — по умолчанию
  const savePhoto = useCallback(async (file: File): Promise<boolean> => {
    if (!carId) return false
    setUploading(true)
    try {
      const image = `data:image/jpeg;base64,${await resizeImage(file, PHOTO_MAX_SIDE, PHOTO_QUALITY)}`
      const frame = DEFAULT_PHOTO_FRAME
      const { error } = await supabase.from('car_photos').upsert({
        car_id: carId,
        image,
        focus_x: frame.x,
        focus_y: frame.y,
        zoom: frame.zoom,
        updated_at: new Date().toISOString()
      })
      if (error) return false
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
    const { error } = await supabase
      .from('car_photos')
      .update({ focus_x: frame.x, focus_y: frame.y, zoom: frame.zoom, updated_at: new Date().toISOString() })
      .eq('car_id', carId)
    if (error) return false
    setPhoto(prev => (prev ? { ...prev, frame } : prev))
    return true
  }, [carId])

  const removePhoto = useCallback(async (): Promise<boolean> => {
    if (!carId) return false
    const { error } = await supabase.from('car_photos').delete().eq('car_id', carId)
    if (error) return false
    setPhoto(null)
    return true
  }, [carId])

  return { photo, loading, uploading, savePhoto, saveFrame, removePhoto }
}
