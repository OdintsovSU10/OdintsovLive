import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ServiceUnitType } from '../../types'
import { formatMileage } from '../../utils/format'
import { parseDecimal, toInputValue } from '../../utils/parse'
import { Field, describedBy } from './Field'

interface Props {
  formId: string
  editing: ServiceUnitType | null
  currentMileage: number
  onSubmit: (data: Omit<ServiceUnitType, 'id' | 'car_id'>) => void
}

type Errors = Partial<Record<'name' | 'mileage', string>>

export function UnitForm({ formId, editing, currentMileage, onSubmit }: Props) {
  const [name, setName] = useState(editing?.name ?? '')
  const [mileage, setMileage] = useState(toInputValue(editing?.replaced_mileage))
  const [errors, setErrors] = useState<Errors>({})

  const mileageHint = `На каком пробеге меняли. Текущий: ${formatMileage(currentMileage)}`

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const mileageValue = parseDecimal(mileage)
    const next: Errors = {}
    if (!name.trim()) next.name = 'Укажите название'
    if (mileage && (mileageValue === null || mileageValue < 0)) next.mileage = 'Пробег — число'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit({
      name: name.trim(),
      replaced_mileage: mileageValue !== null ? Math.round(mileageValue) : null
    })
  }

  return (
    <form id={formId} className="car-form" onSubmit={handleSubmit} noValidate>
      <Field id="unit-name" label="Название" error={errors.name}>
        <input id="unit-name" type="text" placeholder="Форсунки" value={name} autoComplete="off"
          onChange={e => setName(e.target.value)} {...describedBy('unit-name', errors.name)} />
      </Field>
      <Field id="unit-mileage" label="Пробег замены, км" error={errors.mileage} hint={mileageHint}>
        <input id="unit-mileage" type="text" inputMode="numeric" placeholder="Необязательно" value={mileage}
          onChange={e => setMileage(e.target.value)} {...describedBy('unit-mileage', errors.mileage, mileageHint)} />
      </Field>
    </form>
  )
}
