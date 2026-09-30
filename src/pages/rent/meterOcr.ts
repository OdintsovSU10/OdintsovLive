import { supabase } from '../../lib/supabase'
import { resizeImage, type RecognizedMeter } from './rentUtils'

export type OcrJobStatus = 'pending' | 'processing' | 'done' | 'error'

export interface OcrJob {
  id: string
  status: OcrJobStatus
  result: { meters: RecognizedMeter[]; seconds?: number } | null
  error: string | null
  applied: boolean
  created_at: string
}

export const OCR_JOB_FIELDS = 'id, status, result, error, applied, created_at'

// Среднее время распознавания на домашнем ПК, пока нет своей статистики
const DEFAULT_OCR_SECONDS = 90

export const isActiveJob = (job: OcrJob) => job.status === 'pending' || job.status === 'processing'

// Фото сжимаются в браузере и уходят в очередь; домашний ПК заберёт их сам
export const uploadMeterPhotos = async (userId: string, year: number, month: number, files: File[]) => {
  for (const file of files) {
    const image_base64 = await resizeImage(file)
    const { error } = await supabase
      .from('meter_ocr_jobs')
      .insert({ user_id: userId, year, month, image_base64 })
    if (error) throw new Error(error.message)
  }
}

export const estimateOcrSeconds = (jobs: OcrJob[]) => {
  const durations = jobs
    .map(j => j.result?.seconds)
    .filter((s): s is number => typeof s === 'number' && s > 20)
  const average = durations.length > 0
    ? durations.reduce((sum, s) => sum + s, 0) / durations.length
    : DEFAULT_OCR_SECONDS
  return Math.round(jobs.filter(isActiveJob).length * average)
}
