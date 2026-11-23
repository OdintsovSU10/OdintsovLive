import { useEffect, useState, type FC, type FormEvent } from 'react'
import { getUserId } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Toast } from '../../components/ui/Toast'
import { useToast } from '../../hooks/useToast'
import type { INewsSettings } from './types'
import shared from './NewsShared.module.css'
import styles from './SettingsTab.module.css'

const MAX_INTERESTS = 1000
const DEFAULT_TIME = '09:00'
const DEFAULT_THRESHOLD = 80

export const SettingsTab: FC = () => {
  const { toast, showToast, hideToast } = useToast()
  const [userId, setUserId] = useState<string | null>(null)
  const [interests, setInterests] = useState('')
  const [digestTime, setDigestTime] = useState(DEFAULT_TIME)
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLD))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const uid = await getUserId()
      if (cancelled) return
      setUserId(uid)
      if (!uid) {
        setLoading(false)
        return
      }
      const { data, error: queryError } = await supabase
        .from('news_settings')
        .select('user_id, interests, digest_time, push_threshold')
        .eq('user_id', uid)
        .maybeSingle<INewsSettings>()
      if (cancelled) return
      if (queryError) {
        setError(queryError.message)
      } else if (data) {
        setInterests(data.interests)
        setDigestTime(data.digest_time.slice(0, 5))
        setThreshold(String(data.push_threshold))
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const thresholdNumber = Number(threshold)
  const thresholdValid = threshold !== '' && Number.isInteger(thresholdNumber) && thresholdNumber >= 0 && thresholdNumber <= 100
  const canSave = !loading && !saving && userId !== null && thresholdValid && digestTime !== ''

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || !userId) return
    setSaving(true)
    const { error: queryError } = await supabase
      .from('news_settings')
      .upsert(
        {
          user_id: userId,
          interests: interests.trim(),
          digest_time: digestTime,
          push_threshold: thresholdNumber,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
    setSaving(false)
    showToast(queryError ? { message: 'Не удалось сохранить', tone: 'error' } : { message: 'Сохранено' })
  }

  if (loading) return <div className={shared.skeleton} aria-busy="true" />

  return (
    <form className={styles.form} onSubmit={event => void handleSave(event)}>
      {error && <div className={shared.alert} role="alert">{error}</div>}

      <label className={shared.field}>
        <span>Мои интересы</span>
        <textarea
          className={`${shared.input} ${styles.textarea}`}
          value={interests}
          maxLength={MAX_INTERESTS}
          rows={6}
          placeholder="Что для вас важно: темы, компании, регионы"
          onChange={event => setInterests(event.target.value)}
        />
        <span className={styles.counter}>{interests.length} / {MAX_INTERESTS}</span>
      </label>

      <div className={styles.row}>
        <label className={shared.field}>
          <span>Время дайджеста</span>
          <input
            className={`${shared.input} ${styles.time}`}
            type="time"
            value={digestTime}
            onChange={event => setDigestTime(event.target.value)}
          />
        </label>
        <label className={shared.field}>
          <span>Сразу присылать новости важнее (0–100)</span>
          <input
            className={shared.input}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={threshold}
            aria-invalid={!thresholdValid}
            onChange={event => setThreshold(event.target.value)}
          />
        </label>
      </div>

      {!thresholdValid && <p className={shared.fieldError}>Порог — целое число от 0 до 100</p>}

      <p className={shared.hint}>
        Дайджест приходит в Telegram-бот раз в день. Изменения учитываются в новых оценках.
      </p>

      <button type="submit" className={`${shared.button} ${styles.save}`} disabled={!canSave}>
        {saving ? 'Сохранение…' : 'Сохранить'}
      </button>

      <Toast toast={toast} onClose={hideToast} />
    </form>
  )
}
