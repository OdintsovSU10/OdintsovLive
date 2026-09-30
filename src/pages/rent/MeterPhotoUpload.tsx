import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resizeImage, type RecognizedMeter } from './rentUtils'
import './MeterPhotoUpload.css'

type JobStatus = 'pending' | 'processing' | 'done' | 'error'

interface OcrJob {
  id: string
  status: JobStatus
  result: { meters: RecognizedMeter[]; seconds?: number } | null
  error: string | null
  applied: boolean
}

interface MeterPhotoUploadProps {
  userId: string
  year: number
  month: number
  onRecognized: (meters: RecognizedMeter[]) => Promise<void>
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'в очереди',
  processing: 'распознаётся…',
  done: 'готово',
  error: 'ошибка'
}

const POLL_MS = 4000

const formatMeter = (m: RecognizedMeter) => {
  if (m.kind === 'electricity') {
    return `${m.tariff ?? 'Эл.'}: ${m.value.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} кВт·ч`
  }
  return `Вода: ${m.value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} м³`
}

export default function MeterPhotoUpload({ userId, year, month, onRecognized }: MeterPhotoUploadProps) {
  const [jobs, setJobs] = useState<OcrJob[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const onRecognizedRef = useRef(onRecognized)
  const busyRef = useRef(false)
  const reloadRef = useRef(false)

  onRecognizedRef.current = onRecognized

  const loadJobs = async () => {
    if (busyRef.current) {
      reloadRef.current = true
      return
    }
    busyRef.current = true
    try {
      const { data } = await supabase
        .from('meter_ocr_jobs')
        .select('id, status, result, error, applied')
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .order('created_at')
      const list = (data || []) as OcrJob[]

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

  const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'processing')

  useEffect(() => {
    if (!hasActive) return
    const timer = setInterval(loadJobs, POLL_MS)
    return () => clearInterval(timer)
  }, [hasActive, userId, year, month])

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    setUploading(true)
    setUploadError('')
    try {
      for (const file of files) {
        const image_base64 = await resizeImage(file)
        const { error } = await supabase
          .from('meter_ocr_jobs')
          .insert({ user_id: userId, year, month, image_base64 })
        if (error) throw new Error(error.message)
      }
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

  return (
    <div className="content-section">
      <div className="section-header">
        <div className="section-title">Фото счётчиков</div>
        <label className={`photo-upload-btn ${uploading ? 'is-disabled' : ''}`}>
          <Camera size={18} />
          <span>{uploading ? 'Загрузка…' : 'Добавить фото'}</span>
          <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={handleFiles} />
        </label>
      </div>
      <p className="photo-hint">
        Каждый тариф электросчётчика (T1, T2, T3) — отдельным фото, водомеры — одним.
        Распознаёт домашний ПК, 1–3 минуты на фото.
      </p>
      {uploadError && <div className="photo-error">{uploadError}</div>}
      {jobs.length > 0 && (
        <ul className="ocr-jobs">
          {jobs.map(job => (
            <li key={job.id} className={`ocr-job is-${job.status}`}>
              <span className="ocr-job-status">{STATUS_LABELS[job.status]}</span>
              <span className="ocr-job-result">
                {job.status === 'done' && (job.result?.meters.length
                  ? job.result.meters.map(formatMeter).join(' · ')
                  : 'счётчики не найдены')}
                {job.status === 'error' && job.error}
              </span>
              <button className="delete-btn" onClick={() => removeJob(job.id)} aria-label="Удалить">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
