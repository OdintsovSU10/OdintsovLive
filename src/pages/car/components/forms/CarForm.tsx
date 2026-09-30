import { useState } from 'react'
import type { FormEvent } from 'react'
import { MONTHS } from '../../../../lib/constants'
import type { CarFormData, CarType } from '../../types'
import { parseDecimal, toInputValue } from '../../utils/parse'
import { Field, describedBy } from './Field'

interface Props {
  formId: string
  editing: CarType | null
  onSubmit: (data: Partial<CarType>) => void
}

type Errors = Partial<Record<keyof CarFormData, string>>

const CURRENT_YEAR = new Date().getFullYear()

function toForm(car: CarType | null): CarFormData {
  return {
    brand: car?.brand ?? '',
    model: car?.model ?? '',
    manufacture_month: toInputValue(car?.manufacture_month),
    manufacture_year: toInputValue(car?.manufacture_year),
    purchase_date: car?.purchase_date ?? '',
    purchase_mileage: toInputValue(car?.purchase_mileage),
    current_mileage: toInputValue(car?.current_mileage),
    purchase_price: toInputValue(car?.purchase_price),
    vin: car?.vin ?? ''
  }
}

export function CarForm({ formId, editing, onSubmit }: Props) {
  const [form, setForm] = useState<CarFormData>(() => toForm(editing))
  const [errors, setErrors] = useState<Errors>({})

  const update = (key: keyof CarFormData, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const year = parseDecimal(form.manufacture_year)
    const purchaseMileage = parseDecimal(form.purchase_mileage) ?? 0
    const currentMileage = parseDecimal(form.current_mileage) ?? purchaseMileage
    const next: Errors = {}
    if (!form.brand.trim()) next.brand = 'Укажите марку'
    if (!form.model.trim()) next.model = 'Укажите модель'
    if (!year || year < 1950 || year > CURRENT_YEAR + 1) next.manufacture_year = 'Год от 1950 до текущего'
    if (!form.purchase_date) next.purchase_date = 'Укажите дату покупки'
    if (currentMileage < purchaseMileage) next.current_mileage = 'Не меньше пробега при покупке'
    if (form.vin && form.vin.trim().length !== 17) next.vin = 'VIN — 17 символов'
    setErrors(next)
    if (Object.keys(next).length > 0 || !year) return

    onSubmit({
      brand: form.brand.trim(),
      model: form.model.trim(),
      manufacture_month: form.manufacture_month ? Number(form.manufacture_month) : null,
      manufacture_year: Math.round(year),
      purchase_date: form.purchase_date,
      purchase_mileage: Math.round(purchaseMileage),
      current_mileage: Math.round(currentMileage),
      purchase_price: parseDecimal(form.purchase_price),
      vin: form.vin.trim() || null
    })
  }

  return (
    <form id={formId} className="car-form" onSubmit={handleSubmit} noValidate>
      <div className="car-form-row">
        <Field id="car-brand" label="Марка" error={errors.brand}>
          <input id="car-brand" type="text" placeholder="Toyota" value={form.brand} autoComplete="off"
            onChange={e => update('brand', e.target.value)} {...describedBy('car-brand', errors.brand)} />
        </Field>
        <Field id="car-model" label="Модель" error={errors.model}>
          <input id="car-model" type="text" placeholder="Camry" value={form.model} autoComplete="off"
            onChange={e => update('model', e.target.value)} {...describedBy('car-model', errors.model)} />
        </Field>
      </div>

      <div className="car-form-row">
        <Field id="car-month" label="Месяц выпуска">
          <select id="car-month" value={form.manufacture_month} onChange={e => update('manufacture_month', e.target.value)}>
            <option value="">—</option>
            {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
        </Field>
        <Field id="car-year" label="Год выпуска" error={errors.manufacture_year}>
          <input id="car-year" type="text" inputMode="numeric" placeholder="2020" value={form.manufacture_year}
            onChange={e => update('manufacture_year', e.target.value)} {...describedBy('car-year', errors.manufacture_year)} />
        </Field>
      </div>

      <Field id="car-purchase-date" label="Дата покупки" error={errors.purchase_date}>
        <input id="car-purchase-date" type="date" value={form.purchase_date}
          onChange={e => update('purchase_date', e.target.value)} {...describedBy('car-purchase-date', errors.purchase_date)} />
      </Field>

      <div className="car-form-row">
        <Field id="car-purchase-mileage" label="Пробег при покупке">
          <input id="car-purchase-mileage" type="text" inputMode="numeric" placeholder="50000" value={form.purchase_mileage}
            onChange={e => update('purchase_mileage', e.target.value)} />
        </Field>
        <Field id="car-current-mileage" label="Текущий пробег" error={errors.current_mileage}>
          <input id="car-current-mileage" type="text" inputMode="numeric" placeholder="55000" value={form.current_mileage}
            onChange={e => update('current_mileage', e.target.value)} {...describedBy('car-current-mileage', errors.current_mileage)} />
        </Field>
      </div>

      <Field id="car-price" label="Стоимость покупки, ₽">
        <input id="car-price" type="text" inputMode="decimal" placeholder="1 500 000" value={form.purchase_price}
          onChange={e => update('purchase_price', e.target.value)} />
      </Field>

      <Field id="car-vin" label="VIN" error={errors.vin}>
        <input id="car-vin" type="text" placeholder="JTDKN3DU5A0123456" value={form.vin} maxLength={17} autoComplete="off"
          onChange={e => update('vin', e.target.value.toUpperCase())} {...describedBy('car-vin', errors.vin)} />
      </Field>
    </form>
  )
}
