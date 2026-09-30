import { useState } from 'react'
import type { FormEvent } from 'react'
import { PART_CATEGORIES } from '../../constants'
import type { PartFormData, PartType } from '../../types'
import { Field, describedBy } from './Field'

interface Props {
  formId: string
  editing: PartType | null
  onSubmit: (data: Omit<PartType, 'id' | 'car_id'>) => void
}

type Errors = Partial<Record<keyof PartFormData, string>>

export function PartForm({ formId, editing, onSubmit }: Props) {
  const [form, setForm] = useState<PartFormData>({
    category: editing?.category ?? '',
    name: editing?.name ?? '',
    part_number: editing?.part_number ?? '',
    notes: editing?.notes ?? ''
  })
  const [errors, setErrors] = useState<Errors>({})

  // Категория из импорта может быть вне списка — оставляем её выбираемой
  const categories = form.category && !PART_CATEGORIES.includes(form.category)
    ? [...PART_CATEGORIES, form.category]
    : PART_CATEGORIES

  const update = (key: keyof PartFormData, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Errors = {}
    if (!form.category) next.category = 'Выберите категорию'
    if (!form.name.trim()) next.name = 'Укажите название'
    if (!form.part_number.trim()) next.part_number = 'Укажите артикул'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit({
      category: form.category,
      name: form.name.trim(),
      part_number: form.part_number.trim(),
      notes: form.notes.trim() || null
    })
  }

  return (
    <form id={formId} className="car-form" onSubmit={handleSubmit} noValidate>
      <Field id="part-category" label="Категория" error={errors.category}>
        <select id="part-category" value={form.category} onChange={e => update('category', e.target.value)}
          {...describedBy('part-category', errors.category)}>
          <option value="">—</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </Field>
      <Field id="part-name" label="Название" error={errors.name}>
        <input id="part-name" type="text" placeholder="Масляный фильтр" value={form.name}
          onChange={e => update('name', e.target.value)} {...describedBy('part-name', errors.name)} />
      </Field>
      <Field id="part-number" label="Артикул / код" error={errors.part_number}>
        <input id="part-number" type="text" placeholder="W 712/75" value={form.part_number} autoComplete="off"
          onChange={e => update('part_number', e.target.value)} {...describedBy('part-number', errors.part_number)} />
      </Field>
      <Field id="part-notes" label="Заметка">
        <input id="part-notes" type="text" placeholder="Необязательно" value={form.notes}
          onChange={e => update('notes', e.target.value)} />
      </Field>
    </form>
  )
}
