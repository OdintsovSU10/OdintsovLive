import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { RecognizedMeter } from './rentUtils'
import {
  OCR_JOB_FIELDS,
  estimateOcrSeconds,
  isActiveJob,
  uploadMeterPhotos,
  type OcrJob
} from './meterOcr'

const POLL_MS = 4000
// Задание в очереди дольше 2 минут — бот, скорее всего, не работает (обычно ~10 с)
const STALE_MS = 2 * 60 * 1000

interface UseMeterOcrJobsParams {
  userId: string | null
  year: number
  month: number
  onRecognized: (meters: RecognizedMeter[]) => Promise<void>
}

export const useMeterOcrJobs = ({ userId, year, month, onRecognized }: UseMeterOcrJobsParams) => {
  const [jobs, setJobs] = useState<OcrJob[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const onRecognizedRef = useRef(onRecognized)
  const busyRef = useRef(false)
  const reloadRef = useRef(false)

  onRecognizedRef.current = onRecognized

  const loadJobs = async () => {
    if (!userId) return
    if (busyRef.current) {
      reloadRef.current = true
      return
    }
    busyRef.current = true
    try {
      const { data } = await supabase
        .from('meter_ocr_jobs')
        .select(OCR_JOB_FIELDS)
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .order('created_at')
      const list = (data || []) as OcrJob[]

      // Результаты применяем пачкой: иначе вторая порция затрёт первую устаревшим состоянием
      const toApply = list.filter(j => j.status === 'done' && !j.applied && j.result)
      if (toApply.length > 0) {
        await onRecognizedRef.current(toApply.flatMap(j => j.result?.meters || []))
        const ids = toApply.map(j => j.id)
        await supabase.from('meter_ocr_jobs').update({ applied: true }).in('id', ids)
        setJobs(list.map(j => (ids.includes(j.id) ? { ...j, applied: true } : j)))
      } else {
        setJobs(list)
      }
    } finally {
      busyRef.current = false
      if (reloadRef.current) {
        reloadRef.current = false
        loadJobs()
      }
    }
  }

  useEffect(() => {
    loadJobs()
  }, [userId, year, month])

  const activeCount = jobs.filter(isActiveJob).length

  useEffect(() => {
    if (activeCount === 0) return
    const timer = setInterval(loadJobs, POLL_MS)
    return () => clearInterval(timer)
  }, [activeCount > 0, userId, year, month])

  const upload = async (files: File[]) => {
    if (!userId || files.length === 0) return
    setUploading(true)
    setUploadError('')
    try {
      await uploadMeterPhotos(userId, year, month, files)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
      loadJobs()
    }
  }

  const removeJob = async (id: string) => {
    await supabase.from('meter_ocr_jobs').delete().eq('id', id)
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  return {
    jobs,
    uploading,
    uploadError,
    upload,
    removeJob,
    activeCount,
    errorCount: jobs.filter(j => j.status === 'error').length,
    etaSeconds: estimateOcrSeconds(jobs),
    stale: jobs.some(j => j.status === 'pending' && Date.now() - Date.parse(j.created_at) > STALE_MS)
  }
}
