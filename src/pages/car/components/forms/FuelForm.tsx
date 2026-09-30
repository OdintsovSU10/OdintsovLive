import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { SegmentedControl } from '../../../../components/ui/SegmentedControl'
import { FUEL_TYPES } from '../../constants'
import type { FuelType, RecordPayload } from '../../types'
import { todayIso } from '../../utils/dates'
import { formatMileage, formatRub } from '../../utils/format'
import { parseDecimal, roundMoney, toInputValue } from '../../utils/parse'
import { Field, describedBy } from './Field'

interface Props {
  formId: string
  editing: FuelType | null
  fuel: FuelType[]
  currentMileage: number
  onSubmit: (payload: RecordPayload) => void
}

type Errors = Partial<Record<'date' | 'mileage' | 'liters' | 'price', string>>

export function FuelForm({ formId, editing, fuel, currentMileage, onSubmit }: Props) {
  // Новая заправка: цена и тип — как в прошлый раз
  const last = editing ? null : fuel[0] ?? null
  const [date, setDate] = useState(editing?.date ?? todayIso())
  const [mileage, setMileage] = useState(toInputValue(editing?.mileage))
  const [liters, setLiters] = useState(toInputValue(editing?.liters))
  const [price, setPrice] = useState(toInputValue(editing?.price_per_liter ?? last?.price_per_liter))
  const [fuelType, setFuelType] = useState(editing?.fuel_type ?? last?.fuel_type ?? FUEL_TYPES[0])
  const [errors, setErrors] = useState<Errors>({})

  const fuelTypes = useMemo(
    () => Array.from(new Set([...FUEL_TYPES, ...fuel.map(row => row.fuel_type), fuelType])),
    [fuel, fuelType]
  )

  const litersValue = parseDecimal(liters)
  const priceValue = parseDecimal(price)
  const mileageValue = parseDecimal(mileage)
  const total = litersValue && priceValue ? roundMoney(litersValue * priceValue) : null

  const mileageHint = !editing && mileageValue !== null && mileageValue < currentMileage
    ? `Меньше текущего пробега (${formatMileage(currentMileage)}) — проверьте`
    : `Текущий: ${formatMileage(currentMileage)} · нужен для расхода л/100 км`

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Errors = {}
    if (!date) next.date = 'Укажите дату'
    if (mileage && (mileageValue === null || mileageValue <= 0)) next.mileage = 'Пробег — положительное число'
    if (!litersValue || litersValue <= 0) next.liters = 'Сколько литров залили?'
    if (!priceValue || priceValue <= 0) next.price = 'Укажите цену литра'
    setErrors(next)
    if (Object.keys(next).length > 0 || !litersValue || !priceValue) return

    onSubmit({
      kind: 'fuel',
      data: {
        date,
        mileage: mileageValue ? Math.round(mileageValue) : null,
        liters: litersValue,
        price_per_liter: priceValue,
        total_cost: roundMoney(litersValue * priceValue),
        fuel_type: fuelType
      }
    })
  }

  return (
    <form id={formId} className="car-form" onSubmit={handleSubmit} noValidate>
      <div className="car-form-row">
        <Field id="fuel-liters" label="Литры" error={errors.liters}>
          <input id="fuel-liters" type="text" inputMode="decimal" placeholder="40" value={liters}
            onChange={e => setLiters(e.target.value)} {...describedBy('fuel-liters', errors.liters)} />
        </Field>
        <Field id="fuel-price" label="Цена, ₽/л" error={errors.price}>
          <input id="fuel-price" type="text" inputMode="decimal" placeholder="62,5" value={price}
            onChange={e => setPrice(e.target.value)} {...describedBy('fuel-price', errors.price)} />
        </Field>
      </div>

      <div className="car-form-total" aria-live="polite">
        <span>Итого</span>
        <strong>{total ? formatRub(total, total % 1 ? 2 : 0) : '—'}</strong>
      </div>

      <Field id="fuel-mileage" label="Пробег, км" error={errors.mileage} hint={mileageHint}>
        <input id="fuel-mileage" type="text" inputMode="numeric" placeholder={String(currentMileage || '')} value={mileage}
          onChange={e => setMileage(e.target.value)} {...describedBy('fuel-mileage', errors.mileage, mileageHint)} />
      </Field>

      <div className="car-field">
        <span className="car-field-label">Топливо</span>
        <SegmentedControl
          options={fuelTypes.map(type => ({ value: type, label: type }))}
          value={fuelType}
          onChange={setFuelType}
          ariaLabel="Тип топлива"
          stretch
        />
      </div>

      <Field id="fuel-date" label="Дата" error={errors.date}>
        <input id="fuel-date" type="date" value={date} max={todayIso()}
          onChange={e => setDate(e.target.value)} {...describedBy('fuel-date', errors.date)} />
      </Field>
    </form>
  )
}
