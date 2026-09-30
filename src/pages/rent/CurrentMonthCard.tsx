import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { MONTHS } from '../../lib/constants'
import { OCR_JOB_FIELDS, isActiveJob, uploadMeterPhotos, type OcrJob } from './meterOcr'
import type { ElectricityMeter } from './rentUtils'
import './CurrentMonthCard.css'

interface CurrentMonthCardProps {
  userId: string
}

interface CardState {
  year: number
  month: number
  status: string
  needPhotos: boolean
  paid: boolean
}

// До 10-го числа закрываем прошлый месяц, если он ещё не оплачен
const CLOSE_PREV_UNTIL_DAY = 10

const CARD_PHOTO_INPUT_ID = 'card-photo-input'

const formatRub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`

const loadCardState = async (userId: string): Promise<CardState> => {
  const now = new Date()
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  let year = now.getFullYear()
  let month = now.getMonth()
  if (now.getDate() <= CLOSE_PREV_UNTIL_DAY) {
    const { data } = await supabase
      .from('rent_records')
      .select('paid')
      .eq('user_id', userId)
      .eq('year', prevDate.getFullYear())
      .eq('month', prevDate.getMonth())
      .maybeSingle()
    if (!data?.paid) {
      year = prevDate.getFullYear()
      month = prevDate.getMonth()
    }
  }

  const [recordResult, jobsResult] = await Promise.all([
    supabase
      .from('rent_records')
      .select('rent_amount, water_amount, electricity_amount, cold_water, hot_water, electricity, paid')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('meter_ocr_jobs')
      .select(OCR_JOB_FIELDS)
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
  ])

  const record = recordResult.data
  const jobs = (jobsResult.data || []) as OcrJob[]
  const electricity: ElectricityMeter[] = record?.electricity || []
  const hasReadings = Number(record?.cold_water) > 0
    || Number(record?.hot_water) > 0
    || electricity.some(m => m.value > 0)
  const sum = (Number(record?.rent_amount) || 0)
    + (Number(record?.water_amount) || 0)
    + (Number(record?.electricity_amount) || 0)
  const active = jobs.filter(isActiveJob).length
  const recognized = jobs.some(j => j.status === 'done' && !j.applied)

  let status = `К оплате ${formatRub(sum)} · не оплачено`
  if (record?.paid) status = `Оплачено · ${formatRub(sum)}`
  else if (active > 0) status = `Распознаю фото: осталось ${active}`
  else if (recognized) status = 'Показания распознаны — проверьте'
  else if (!hasReadings) status = 'Нужны фото счётчиков'

  return {
    year,
    month,
    status,
    needPhotos: !record?.paid && active === 0 && !recognized && !hasReadings,
    paid: Boolean(record?.paid)
  }
}

// Быстрый вход в месяц, который сейчас нужно закрыть
export default function CurrentMonthCard({ userId }: CurrentMonthCardProps) {
  const navigate = useNavigate()
  const [card, setCard] = useState<CardState | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadCardState(userId).then(setCard)
  }, [userId])

  if (!card) return null

  const monthUrl = `/rent/${card.year}/${card.month}`

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    setError('')
    try {
      await uploadMeterPhotos(userId, card.year, card.month, files)
      navigate(monthUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить фото')
      setUploading(false)
    }
  }

  return (
    <div className={`current-month-card ${card.paid ? 'is-paid' : ''}`}>
      <div className="current-month-info">
        <span className="current-month-name">{MONTHS[card.month]} {card.year}</span>
        <span className="current-month-status">{card.status}</span>
        {error && <span className="current-month-error">{error}</span>}
      </div>
      <div className="current-month-actions">
        {card.needPhotos && (
          <>
            <input id={CARD_PHOTO_INPUT_ID} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
            <label htmlFor={CARD_PHOTO_INPUT_ID} className={`current-month-btn is-primary ${uploading ? 'is-disabled' : ''}`}>
              <Camera size={18} />
              <span>{uploading ? 'Загрузка…' : 'Добавить фото'}</span>
            </label>
          </>
        )}
        <button className="current-month-btn" onClick={() => navigate(monthUrl)}>
          <span>Открыть</span>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
