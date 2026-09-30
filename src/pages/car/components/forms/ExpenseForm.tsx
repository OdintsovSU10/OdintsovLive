import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { EXPENSE_CATEGORIES } from '../../constants'
import type { ExpenseType, RecordPayload } from '../../types'
import { todayIso } from '../../utils/dates'
import { parseDecimal, toInputValue } from '../../utils/parse'
import { ChipGroup } from './ChipGroup'
import { Field, describedBy } from './Field'

interface Props {
  formId: string
  editing: ExpenseType | null
  expenses: ExpenseType[]
  onSubmit: (payload: RecordPayload) => void
}

type Errors = Partial<Record<'cost' | 'category' | 'date', string>>

export function ExpenseForm({ formId, editing, expenses, onSubmit }: Props) {
  const [cost, setCost] = useState(toInputValue(editing?.cost))
  const [category, setCategory] = useState(editing?.category ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [date, setDate] = useState(editing?.date ?? todayIso())
  const [errors, setErrors] = useState<Errors>({})

  // Категории от Telegram-бота могут быть вне стандартного списка
  const categories = useMemo(
    () => Array.from(new Set([...EXPENSE_CATEGORIES, ...expenses.map(row => row.category)])),
    [expenses]
  )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const costValue = parseDecimal(cost)
    const next: Errors = {}
    if (!costValue || costValue <= 0) next.cost = 'Укажите сумму'
    if (!category) next.category = 'Выберите категорию'
    if (!date) next.date = 'Укажите дату'
    setErrors(next)
    if (Object.keys(next).length > 0 || !costValue) return

    onSubmit({
      kind: 'expense',
      data: { date, category, description: description.trim() || null, cost: costValue }
    })
  }

  return (
    <form id={formId} className="car-form" onSubmit={handleSubmit} noValidate>
      <Field id="exp-cost" label="Сумма, ₽" error={errors.cost}>
        <input id="exp-cost" type="text" inputMode="decimal" placeholder="0" value={cost}
          onChange={e => setCost(e.target.value)} {...describedBy('exp-cost', errors.cost)} />
      </Field>

      <div className={`car-field ${errors.category ? 'invalid' : ''}`}>
        <span className="car-field-label">Категория</span>
        <ChipGroup options={categories} value={category} onChange={setCategory} ariaLabel="Категория" />
        {errors.category && <p className="car-field-error" role="alert">{errors.category}</p>}
      </div>

      <Field id="exp-description" label="Описание">
        <input id="exp-description" type="text" placeholder="Необязательно" value={description}
          onChange={e => setDescription(e.target.value)} />
      </Field>

      <Field id="exp-date" label="Дата" error={errors.date}>
        <input id="exp-date" type="date" value={date} max={todayIso()}
          onChange={e => setDate(e.target.value)} {...describedBy('exp-date', errors.date)} />
      </Field>
    </form>
  )
}
