import { useEffect, useState } from 'react'
import { Camera, Check, Share } from 'lucide-react'
import type { RentStage } from './readings'
import './RentActionBar.css'

interface RentActionBarProps {
  stage: RentStage
  photoInputId: string
  uploading: boolean
  activeJobs: number
  etaSeconds: number
  missing: string[]
  error: { text: string; inputId: string } | null
  warning: string | null
  total: number
  message: string
  onTogglePaid: () => void
}

const formatEta = (seconds: number) => `≈${Math.max(1, Math.round(seconds / 60))} мин`

// Одна кнопка внизу экрана, которая подсказывает следующий шаг месяца
export default function RentActionBar({
  stage,
  photoInputId,
  uploading,
  activeJobs,
  etaSeconds,
  missing,
  error,
  warning,
  total,
  message,
  onTogglePaid
}: RentActionBarProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  // navigator.share вызываем сразу в обработчике тапа, иначе iOS откажет
  const handleSend = () => {
    if (typeof navigator.share === 'function') {
      navigator.share({ text: message }).catch(() => {})
      return
    }
    navigator.clipboard.writeText(message).then(() => setCopied(true))
  }

  const photoButton = (label: string, primary: boolean) => (
    <label htmlFor={photoInputId} className={`action-btn ${primary ? 'is-primary' : ''} ${uploading ? 'is-disabled' : ''}`}>
      <Camera size={18} />
      <span>{uploading ? 'Загрузка…' : label}</span>
    </label>
  )

  const paidButton = (
    <button className="action-btn" onClick={onTogglePaid}>
      <Check size={18} />
      <span>Оплачено</span>
    </button>
  )

  if (stage === 'paid') {
    return (
      <div className="rent-action-bar is-paid">
        <span className="action-status">✓ Оплачено · {Math.round(total).toLocaleString('ru-RU')} ₽</span>
        <button className="action-link" onClick={onTogglePaid}>Отменить</button>
      </div>
    )
  }

  let status: string | null = null
  let actions = (
    <>
      <button className="action-btn is-primary" onClick={handleSend}>
        <Share size={18} />
        <span>{copied ? 'Скопировано' : 'Отправить'}</span>
      </button>
      {paidButton}
    </>
  )

  if (stage === 'photos') {
    actions = <>{photoButton('Добавить фото', true)}{paidButton}</>
  } else if (stage === 'recognizing') {
    status = `Распознаю: осталось ${activeJobs} фото · ${formatEta(etaSeconds)}`
    actions = <>{photoButton('Фото', false)}</>
  } else if (stage === 'error' && error) {
    status = error.text
    actions = (
      <>
        <button className="action-btn is-primary" onClick={() => document.getElementById(error.inputId)?.focus()}>
          Исправить
        </button>
        {paidButton}
      </>
    )
  } else if (stage === 'incomplete') {
    status = `Не хватает: ${missing.join('; ')}`
    actions = <>{photoButton('Фото', false)}{paidButton}</>
  } else if (warning) {
    status = `! ${warning}`
  }

  return (
    <div className="rent-action-bar">
      {status && <span className={`action-status ${stage === 'error' ? 'is-error' : ''}`}>{status}</span>}
      <div className="action-buttons">{actions}</div>
    </div>
  )
}
