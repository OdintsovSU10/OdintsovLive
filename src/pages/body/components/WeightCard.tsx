import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { toLocalIsoDate } from '../../../lib/dateUtils'
import { addDays, deltaClass, formatDelta, formatFullDate, formatNum, parseDecimal } from '../bodyFormat'
import type { IBodyWeight } from '../bodyParamsConfig'
import { WeightChart } from './WeightChart'

interface IProps {
  records: IBodyWeight[]
  loading: boolean
  loadError: string | null
  onSave: (date: string, weight: number) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}

const MAX_WEIGHT = 999.99

// Изменение к последней записи не позже (последняя дата − days)
const changeSince = (records: IBodyWeight[], days: number): number | null => {
  const last = records[records.length - 1]
  const target = addDays(last.date, -days)
  for (let i = records.length - 2; i >= 0; i -= 1) {
    if (records[i].date <= target) return last.weight - records[i].weight
  }
  return null
}

export const WeightCard = ({ records, loading, loadError, onSave, onRemove }: IProps) => {
  const [value, setValue] = useState('')
  const [date, setDate] = useState(() => toLocalIsoDate())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const last = records.length > 0 ? records[records.length - 1] : null
  const existing = records.find(r => r.date === date) ?? null

  const changes = useMemo(() => {
    if (records.length < 2) return []
    return [
      { label: 'за 7 дн', delta: changeSince(records, 7) },
      { label: 'за 30 дн', delta: changeSince(records, 30) }
    ].filter(c => c.delta !== null) as { label: string; delta: number }[]
  }, [records])

  const handleSave = async () => {
    if (saving) return
    const weight = parseDecimal(value)
    if (weight === null || Number.isNaN(weight) || weight <= 0 || weight > MAX_WEIGHT) {
      setMessage('Введите вес числом, например 82.4')
      return
    }
    if (!date) {
      setMessage('Выберите дату')
      return
    }
    setSaving(true)
    const error = await onSave(date, weight)
    setSaving(false)
    setMessage(error)
    if (!error) {
      setValue('')
      setDate(toLocalIsoDate())
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Удалить запись?')) return
    setMessage(await onRemove(id))
  }

  const pickRecord = (record: IBodyWeight) => {
    setDate(record.date)
    setValue(String(record.weight))
    setMessage(null)
    inputRef.current?.focus()
  }

  return (
    <section className="body-card" aria-labelledby="body-weight-title">
      <div className="body-card-head">
        <h2 id="body-weight-title">Вес</h2>
      </div>

      {loadError && <p className="body-error" role="alert">{loadError}</p>}

      {last ? (
        <div className="body-weight-summary">
          <div>
            <div className="body-weight-now">{formatNum(last.weight, 2)} <span>кг</span></div>
            <div className="body-muted">{formatFullDate(last.date)}</div>
          </div>
          <div className="body-weight-changes">
            {changes.map(c => (
              <div key={c.label} className="body-change">
                <span className={`body-delta ${deltaClass(c.delta)}`}>{formatDelta(c.delta, 2)} кг</span>
                <span className="body-muted">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        !loading && <p className="body-muted">Записей веса пока нет — введите первый ниже.</p>
      )}

      <form className="body-weight-form" onSubmit={e => { e.preventDefault(); handleSave() }}>
        <div className="body-weight-fields">
          <ClearableInput
            ref={inputRef}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="Вес, кг"
            aria-label="Вес, кг"
            className="body-input"
            wrapperClassName="body-weight-value"
            value={value}
            clearLabel="Очистить вес"
            onClear={() => setValue('')}
            onChange={e => setValue(e.target.value)}
            disabled={saving}
          />
          <input
            type="date"
            className="body-input body-date"
            aria-label="Дата"
            value={date}
            onChange={e => setDate(e.target.value)}
            disabled={saving}
          />
          <button type="submit" className="body-btn primary" disabled={saving || value.trim() === ''}>
            {existing ? 'Заменить' : 'Сохранить'}
          </button>
        </div>
        {existing && (
          <p className="body-muted">За эту дату уже {formatNum(existing.weight, 2)} кг — сохранение заменит</p>
        )}
        {message && <p className="body-error" role="alert">{message}</p>}
      </form>

      <WeightChart records={records} />

      {records.length > 0 && (
        <div className="body-fold">
          <button
            type="button"
            className="body-fold-toggle"
            aria-expanded={showAll}
            onClick={() => setShowAll(v => !v)}
          >
            <span>Все записи ({records.length})</span>
            <ChevronDown size={18} className="body-fold-icon" />
          </button>
          {showAll && (
            <ul className="body-rows">
              {[...records].reverse().map((r, idx, arr) => {
                const prev = arr[idx + 1]
                const delta = prev ? r.weight - prev.weight : null
                return (
                  <li key={r.id} className="body-row">
                    <button type="button" className="body-row-main" onClick={() => pickRecord(r)} title="Исправить">
                      <span className="body-row-date">{formatFullDate(r.date)}</span>
                      <span className="body-row-value">{formatNum(r.weight, 2)} кг</span>
                      {delta !== null && delta !== 0 && (
                        <span className={`body-delta ${deltaClass(delta)}`}>{formatDelta(delta, 2)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="body-icon-btn"
                      aria-label={`Удалить запись за ${formatFullDate(r.date)}`}
                      onClick={() => handleRemove(r.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
