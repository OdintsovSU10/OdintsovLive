import { useState } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { toLocalIsoDate } from '../../../lib/dateUtils'
import { parseDecimal } from '../bodyFormat'
import { PAIRS, PARAMS_CONFIG, PARAM_LABELS, SINGLE_KEYS } from '../bodyParamsConfig'
import type { IBodyParams, ParamKey, ParamValues } from '../bodyParamsConfig'

type FormValues = Record<ParamKey, string>

interface IProps {
  editing: IBodyParams | null
  latest: IBodyParams | null
  records: IBodyParams[]
  onSave: (editingId: string | null, date: string, values: ParamValues) => Promise<string | null>
  onClose: () => void
}

const MAX_VALUE = 999.9

const buildForm = (editing: IBodyParams | null): FormValues => {
  const form = {} as FormValues
  PARAMS_CONFIG.forEach(p => {
    const v = editing?.[p.key]
    form[p.key] = v === null || v === undefined ? '' : String(v)
  })
  return form
}

export const MeasurementModal = ({ editing, latest, records, onSave, onClose }: IProps) => {
  const [date, setDate] = useState(editing?.date ?? toLocalIsoDate())
  const [form, setForm] = useState<FormValues>(() => buildForm(editing))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sameDay = !editing && records.some(r => r.date === date)

  const setField = (key: ParamKey, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (saving) return
    if (!date) {
      setError('Выберите дату')
      return
    }
    const values = {} as ParamValues
    for (const p of PARAMS_CONFIG) {
      const num = parseDecimal(form[p.key])
      if (num !== null && (Number.isNaN(num) || num <= 0 || num > MAX_VALUE)) {
        setError(`Некорректное значение: ${p.label}`)
        return
      }
      values[p.key] = num
    }
    if (Object.values(values).every(v => v === null)) {
      setError('Заполните хотя бы один параметр')
      return
    }
    setSaving(true)
    const result = await onSave(editing?.id ?? null, date, values)
    setSaving(false)
    if (result) setError(result)
    else onClose()
  }

  const renderField = (key: ParamKey, label: string) => {
    const prev = latest?.[key]
    return (
      <label key={key} className="body-field">
        <span className="body-field-label">{label}</span>
        <ClearableInput
          type="text"
          inputMode="decimal"
          className="body-input"
          placeholder={prev === null || prev === undefined ? '—' : String(prev)}
          value={form[key]}
          clearLabel={`Очистить: ${PARAM_LABELS[key]}`}
          onClear={() => setField(key, '')}
          onChange={e => setField(key, e.target.value)}
          disabled={saving}
        />
      </label>
    )
  }

  return (
    <BottomSheet
      title={editing ? 'Редактировать замер' : 'Новый замер'}
      variant="modal"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="body-btn" onClick={onClose}>Отмена</button>
          <button type="button" className="body-btn primary" onClick={handleSave} disabled={saving}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="body-form">
        <label className="body-field">
          <span className="body-field-label">Дата</span>
          <input
            type="date"
            className="body-input body-date"
            value={date}
            onChange={e => setDate(e.target.value)}
            disabled={saving}
          />
        </label>
        {sameDay && <p className="body-muted">За эту дату замер уже есть — значения дополнят его</p>}
        <p className="body-muted">Значения в сантиметрах; серым — прошлый замер.</p>

        <div className="body-form-grid">
          {SINGLE_KEYS.map(key => renderField(key, PARAM_LABELS[key]))}
        </div>
        <div className="body-pairs">
          {PAIRS.map(pair => (
            <fieldset key={pair.title} className="body-pair">
              <legend>{pair.title}</legend>
              <div className="body-form-grid">
                {renderField(pair.left, 'Левый')}
                {renderField(pair.right, 'Правый')}
              </div>
            </fieldset>
          ))}
        </div>
        {error && <p className="body-error" role="alert">{error}</p>}
      </div>
    </BottomSheet>
  )
}
