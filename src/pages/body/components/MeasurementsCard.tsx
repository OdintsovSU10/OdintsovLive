import { useMemo, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { deltaClass, formatDelta, formatFullDate, formatLongDate, formatNum } from '../bodyFormat'
import { DEFAULT_PARAM, PARAMS_CONFIG, PARAM_LABELS, PARAM_SHORT_LABELS, TILE_KEYS } from '../bodyParamsConfig'
import type { IBodyParams, ParamKey, ParamValues } from '../bodyParamsConfig'
import { MeasurementModal } from './MeasurementModal'
import { TrendChart } from './TrendChart'

interface IProps {
  records: IBodyParams[]
  loading: boolean
  loadError: string | null
  onSave: (editingId: string | null, date: string, values: ParamValues) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}

interface IModalState {
  editing: IBodyParams | null
}

// Изменение последнего значения к предыдущему замеру, где поле было заполнено
const paramDelta = (records: IBodyParams[], key: ParamKey): number | null => {
  const current = records[0]?.[key]
  if (current === null || current === undefined) return null
  const prev = records.slice(1).find(r => r[key] !== null)
  if (!prev) return null
  const delta = current - (prev[key] as number)
  return delta === 0 ? null : delta
}

const filledCount = (record: IBodyParams): number =>
  PARAMS_CONFIG.filter(p => record[p.key] !== null).length

export const MeasurementsCard = ({ records, loading, loadError, onSave, onRemove }: IProps) => {
  const [modal, setModal] = useState<IModalState | null>(null)
  const [selected, setSelected] = useState<ParamKey>(DEFAULT_PARAM)
  const [showAll, setShowAll] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const latest = records[0] ?? null

  const points = useMemo(
    () => records
      .filter(r => r[selected] !== null)
      .map(r => ({ date: r.date, value: r[selected] as number }))
      .reverse(),
    [records, selected]
  )

  const handleRemove = async (id: string) => {
    if (!confirm('Удалить запись?')) return
    setMessage(await onRemove(id))
  }

  return (
    <section className="body-card" aria-labelledby="body-params-title">
      <div className="body-card-head">
        <div>
          <h2 id="body-params-title">Замеры</h2>
          {latest && <div className="body-muted">последний — {formatLongDate(latest.date)}</div>}
        </div>
        <button type="button" className="body-btn primary" onClick={() => setModal({ editing: null })}>
          <Plus size={18} />
          <span>Новый замер</span>
        </button>
      </div>

      {loadError && <p className="body-error" role="alert">{loadError}</p>}
      {message && <p className="body-error" role="alert">{message}</p>}

      {!latest ? (
        !loading && <p className="body-muted">Замеров пока нет — добавьте первый, чтобы видеть динамику.</p>
      ) : (
        <>
          <div className="body-tiles">
            {TILE_KEYS.map(key => {
              const value = latest[key]
              const delta = paramDelta(records, key)
              return (
                <button
                  key={key}
                  type="button"
                  className={`body-tile ${selected === key ? 'selected' : ''}`}
                  aria-pressed={selected === key}
                  onClick={() => setSelected(key)}
                >
                  <span className="body-tile-label" title={PARAM_LABELS[key]}>{PARAM_SHORT_LABELS[key]}</span>
                  <span className="body-tile-value">
                    {value === null ? '—' : `${formatNum(value, 1)} см`}
                  </span>
                  {delta !== null && (
                    <span className={`body-delta ${deltaClass(delta)}`}>{formatDelta(delta, 1)}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="body-chart-block">
            <h3 className="body-subtitle">Динамика: {PARAM_LABELS[selected]}</h3>
            {points.length < 2 ? (
              <p className="body-muted body-chart-empty">Нужно минимум 2 замера</p>
            ) : (
              <TrendChart points={points} unit="см" decimals={1} />
            )}
          </div>

          <div className="body-fold">
            <button
              type="button"
              className="body-fold-toggle"
              aria-expanded={showAll}
              onClick={() => setShowAll(v => !v)}
            >
              <span>История замеров ({records.length})</span>
              <ChevronDown size={18} className="body-fold-icon" />
            </button>
            {showAll && (
              <ul className="body-rows">
                {records.map(r => (
                  <li key={r.id} className="body-row">
                    <div className="body-row-main static">
                      <span className="body-row-date">{formatFullDate(r.date)}</span>
                      <span className="body-muted">{filledCount(r)} парам.</span>
                    </div>
                    <button
                      type="button"
                      className="body-icon-btn"
                      aria-label={`Изменить замер за ${formatFullDate(r.date)}`}
                      onClick={() => setModal({ editing: r })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="body-icon-btn"
                      aria-label={`Удалить замер за ${formatFullDate(r.date)}`}
                      onClick={() => handleRemove(r.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {modal && (
        <MeasurementModal
          editing={modal.editing}
          latest={latest}
          records={records}
          onSave={onSave}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )
}
