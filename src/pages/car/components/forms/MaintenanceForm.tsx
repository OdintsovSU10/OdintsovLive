import { useState } from 'react'
import type { FormEvent } from 'react'
import { MAINTENANCE_PRESETS } from '../../constants'
import type { MaintenanceType, RecordPayload } from '../../types'
import { todayIso } from '../../utils/dates'
import { formatMileage } from '../../utils/format'
import { parseDecimal, toInputValue } from '../../utils/parse'
import { ChipGroup } from './ChipGroup'
import { Field, describedBy } from './Field'

interface Props {
  formId: string
  editing: MaintenanceType | null
  currentMileage: number
  onSubmit: (payload: RecordPayload) => void
}

type Errors = Partial<Record<'type' | 'date' | 'mileage' | 'cost', string>>

export function MaintenanceForm({ formId, editing, currentMileage, onSubmit }: Props) {
  const [type, setType] = useState(editing?.type ?? '')
  const [date, setDate] = useState(editing?.date ?? todayIso())
  const [mileage, setMileage] = useState(toInputValue(editing?.mileage))
  const [cost, setCost] = useState(toInputValue(editing?.cost))
  const [description, setDescription] = useState(editing?.description ?? '')
  const [errors, setErrors] = useState<Errors>({})

  const mileageHint = `Текущий: ${formatMileage(currentMileage)}`

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const mileageValue = parseDecimal(mileage)
    const costValue = parseDecimal(cost)
    const next: Errors = {}
    if (!type.trim()) next.type = 'Что делали? Выберите или впишите'
    if (!date) next.date = 'Укажите дату'
    if (mileage && (mileageValue === null || mileageValue <= 0)) next.mileage = 'Пробег — положительное число'
    if (cost && (costValue === null || costValue < 0)) next.cost = 'Стоимость — число'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit({
      kind: 'maintenance',
      data: {
        date,
        type: type.trim(),
        mileage: mileageValue ? Math.round(mileageValue) : null,
        cost: costValue,
        description: description.trim() || null
      }
    })
  }

  return (
    <form id={formId} className="car-form" onSubmit={handleSubmit} noValidate>
      <Field id="mnt-type" label="Работы" error={errors.type}>
        <input id="mnt-type" type="text" placeholder="Замена масла" value={type} autoComplete="off"
          onChange={e => setType(e.target.value)} {...describedBy('mnt-type', errors.type)} />
      </Field>
      <ChipGroup options={MAINTENANCE_PRESETS} value={type} onChange={setType} ariaLabel="Частые работы" />

      <div className="car-form-row">
        <Field id="mnt-cost" label="Стоимость, ₽" error={errors.cost}>
          <input id="mnt-cost" type="text" inputMode="decimal" placeholder="0" value={cost}
            onChange={e => setCost(e.target.value)} {...describedBy('mnt-cost', errors.cost)} />
        </Field>
        <Field id="mnt-mileage" label="Пробег, км" error={errors.mileage} hint={mileageHint}>
          <input id="mnt-mileage" type="text" inputMode="numeric" placeholder={String(currentMileage || '')} value={mileage}
            onChange={e => setMileage(e.target.value)} {...describedBy('mnt-mileage', errors.mileage, mileageHint)} />
        </Field>
      </div>

      <Field id="mnt-date" label="Дата" error={errors.date}>
        <input id="mnt-date" type="date" value={date} max={todayIso()}
          onChange={e => setDate(e.target.value)} {...describedBy('mnt-date', errors.date)} />
      </Field>

      <Field id="mnt-description" label="Комментарий">
        <textarea id="mnt-description" rows={3} placeholder="Масло 5W-30, фильтр Mann W 712" value={description}
          onChange={e => setDescription(e.target.value)} />
      </Field>
    </form>
  )
}
