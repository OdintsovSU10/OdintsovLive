import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { resizeImage } from '../../rent/rentUtils'

// Обложке хватает 1280 px по длинной стороне: ~150–250 КБ вместо мегабайтов оригинала
const PHOTO_MAX_SIDE = 1280
const PHOTO_QUALITY = 0.8

export function useCarPhoto(carId: string | null) {
  const [photo, setPhoto] = useState<string | null>(null)
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
      .select('image')
      .eq('car_id', carId)
      .maybeSingle()
      .then(({ data }) => {
        if (request !== requestRef.current) return
        setPhoto(data?.image ?? null)
        setLoading(false)
      })
  }, [carId])

  // Сжатие в браузере, в БД — только готовый JPEG
  const savePhoto = useCallback(async (file: File): Promise<boolean> => {
    if (!carId) return false
    setUploading(true)
    try {
      const image = `data:image/jpeg;base64,${await resizeImage(file, PHOTO_MAX_SIDE, PHOTO_QUALITY)}`
      const { error } = await supabase
        .from('car_photos')
        .upsert({ car_id: carId, image, updated_at: new Date().toISOString() })
      if (error) return false
      setPhoto(image)
      return true
    } catch {
      return false
    } finally {
      setUploading(false)
    }
  }, [carId])

  const removePhoto = useCallback(async (): Promise<boolean> => {
    if (!carId) return false
    const { error } = await supabase.from('car_photos').delete().eq('car_id', carId)
    if (error) return false
    setPhoto(null)
    return true
  }, [carId])

  return { photo, loading, uploading, savePhoto, removePhoto }
}
