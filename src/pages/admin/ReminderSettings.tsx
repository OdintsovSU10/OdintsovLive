import { useCallback, useEffect, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  DEFAULT_REMINDER_SETTINGS,
  mergeReminderSettings,
  prepareReminderSettings,
  REMINDER_CHECKS,
  validateReminderSettings,
  type IReminderSettings
} from './reminderDefaults'
import ReminderOffsets from './ReminderOffsets'
import ReminderTimeList from './ReminderTimeList'
import './ReminderSettings.css'

const HOURS = Array.from({ length: 25 }, (_, hour) => hour)

export default function ReminderSettings() {
  const [settings, setSettings] = useState<IReminderSettings>(DEFAULT_REMINDER_SETTINGS)
  const [saved, setSaved] = useState<IReminderSettings>(DEFAULT_REMINDER_SETTINGS)
  // меняется при загрузке и сбросе: пересоздаёт поля, которые держат текст у себя
  const [formVersion, setFormVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('get_reminder_settings')
    if (rpcError) {
      setError(rpcError.message)
    } else {
      const merged = mergeReminderSettings(data)
      setSettings(merged)
      setSaved(merged)
      setFormVersion(version => version + 1)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateMeters = (patch: Partial<IReminderSettings['meters']>) => {
    setSettings(current => ({ ...current, meters: { ...current.meters, ...patch } }))
  }

  const updateTodos = (patch: Partial<IReminderSettings['todos']>) => {
    setSettings(current => ({ ...current, todos: { ...current.todos, ...patch } }))
  }

  const updateDaily = (patch: Partial<IReminderSettings['daily']>) => {
    setSettings(current => ({ ...current, daily: { ...current.daily, ...patch } }))
  }

  const toggleCheck = (key: string, value: boolean) => {
    setSettings(current => ({
      ...current,
      daily: { ...current.daily, checks: { ...current.daily.checks, [key]: value } }
    }))
  }

  const resetToDefaults = () => {
    setError('')
    setSuccess('')
    setSettings(DEFAULT_REMINDER_SETTINGS)
    setFormVersion(version => version + 1)
  }

  const save = async () => {
    setError('')
    setSuccess('')

    const validationError = validateReminderSettings(settings)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    const prepared = prepareReminderSettings(settings)
    const { data, error: rpcError } = await supabase.rpc('set_reminder_settings', { p_settings: prepared })
    if (rpcError) {
      setError(rpcError.message)
    } else {
      const merged = mergeReminderSettings(data)
      setSettings(merged)
      setSaved(merged)
      setFormVersion(version => version + 1)
      setSuccess('Сохранено. Бот подхватит изменения в течение минуты.')
    }
    setSaving(false)
  }

  const busy = loading || saving
  const changed = JSON.stringify(settings) !== JSON.stringify(saved)
  const { meters, todos, daily } = settings

  return (
    <div className="fot-token-settings reminder-settings">
      <div className="fot-token-header">
        <div>
          <h2><Bell size={21} /> Напоминания</h2>
          <p>Когда бот пишет в Telegram. Всё время — по Москве.</p>
        </div>
        <button
          type="button"
          className="fot-refresh-btn"
          onClick={() => void load()}
          disabled={busy}
          title="Перечитать настройки"
        >
          <RefreshCw size={17} className={loading ? 'spinning' : ''} />
          <span>Обновить</span>
        </button>
      </div>

      <div className="reminder-groups" key={formVersion}>
        <section className="reminder-group">
          <h3>Счётчики</h3>
          <label className="reminder-check">
            <input
              type="checkbox"
              checked={meters.enabled}
              onChange={event => updateMeters({ enabled: event.target.checked })}
              disabled={busy}
            />
            <span>Напоминать о показаниях счётчиков</span>
          </label>
          <div className="reminder-pair">
            <div className="reminder-field">
              <label htmlFor="reminder-meters-day" className="reminder-field-label">День месяца</label>
              <input
                id="reminder-meters-day"
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                value={Number.isNaN(meters.day) ? '' : meters.day}
                onChange={event => updateMeters({ day: event.target.value === '' ? Number.NaN : Number(event.target.value) })}
                disabled={busy}
              />
            </div>
            <div className="reminder-field">
              <label htmlFor="reminder-meters-deadline" className="reminder-field-label">Срок до</label>
              <input
                id="reminder-meters-deadline"
                type="time"
                value={meters.deadline}
                onChange={event => updateMeters({ deadline: event.target.value })}
                disabled={busy}
              />
            </div>
          </div>
          <ReminderTimeList
            label="Накануне"
            times={meters.dayBefore}
            disabled={busy}
            onChange={dayBefore => updateMeters({ dayBefore })}
          />
          <ReminderTimeList
            label="В день срока"
            times={meters.onDay}
            disabled={busy}
            onChange={onDay => updateMeters({ onDay })}
          />
          <p className="fot-token-help">
            Если за месяц уже есть фото или показания, бот молчит. При дне 1 напоминание «накануне» не отправляется.
          </p>
        </section>

        <section className="reminder-group">
          <h3>Дела со временем</h3>
          <label className="reminder-check">
            <input
              type="checkbox"
              checked={todos.enabled}
              onChange={event => updateTodos({ enabled: event.target.checked })}
              disabled={busy}
            />
            <span>Напоминать о делах со временем</span>
          </label>
          <ReminderOffsets
            offsets={todos.offsets}
            disabled={busy}
            onChange={offsets => updateTodos({ offsets })}
          />
        </section>

        <section className="reminder-group">
          <h3>Остальные напоминания</h3>
          <div className="reminder-pair">
            <div className="reminder-field">
              <label htmlFor="reminder-from-hour" className="reminder-field-label">Не раньше</label>
              <select
                id="reminder-from-hour"
                value={daily.fromHour}
                onChange={event => updateDaily({ fromHour: Number(event.target.value) })}
                disabled={busy}
              >
                {HOURS.slice(0, 24).map(hour => (
                  <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
                ))}
              </select>
            </div>
            <div className="reminder-field">
              <label htmlFor="reminder-to-hour" className="reminder-field-label">Не позже</label>
              <select
                id="reminder-to-hour"
                value={daily.toHour}
                onChange={event => updateDaily({ toHour: Number(event.target.value) })}
                disabled={busy}
              >
                {HOURS.map(hour => (
                  <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="reminder-checks">
            {REMINDER_CHECKS.map(({ key, label }) => (
              <label className="reminder-check" key={key}>
                <input
                  type="checkbox"
                  checked={daily.checks[key] !== false}
                  onChange={event => toggleCheck(key, event.target.checked)}
                  disabled={busy}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="fot-token-help">Эти проверки бот делает только в окне между «Не раньше» и «Не позже».</p>
        </section>
      </div>

      <div className="reminder-actions">
        <button
          type="button"
          className="fot-token-save"
          onClick={() => void save()}
          disabled={!changed || busy}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button
          type="button"
          className="reminder-secondary-btn"
          onClick={resetToDefaults}
          disabled={busy}
        >
          По умолчанию
        </button>
      </div>

      {error && <div className="fot-token-message error" role="alert">{error}</div>}
      {success && <div className="fot-token-message success" role="status">{success}</div>}
    </div>
  )
}
