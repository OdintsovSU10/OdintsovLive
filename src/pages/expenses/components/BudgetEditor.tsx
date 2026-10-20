import { useMemo, useState, type FormEvent } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import type { BudgetDraft } from '../hooks/useBudgets'
import type { ExpenseUserCategory } from '../types'
import type { BudgetLimit } from '../utils/budget'

const FORM_ID = 'budget-editor-form'

interface Props {
  categories: ExpenseUserCategory[]
  limits: BudgetLimit[]
  saving: boolean
  onSave: (draft: BudgetDraft) => void
  onClose: () => void
}

// Пустая строка — лимита нет; иначе положительное число (допускаем запятую и пробелы)
function parseLimit(value: string): number | null | undefined {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : undefined
}

export function BudgetEditor({ categories, limits, saving, onSave, onClose }: Props) {
  const initial = useMemo(
    () => new Map(limits.map(item => [item.category_id, String(item.monthly_limit)])),
    [limits]
  )
  const activeCategories = useMemo(() => categories.filter(category => category.is_active), [categories])

  const [values, setValues] = useState<Map<string, string>>(initial)
  const [error, setError] = useState<string | null>(null)

  const setValue = (categoryId: string, value: string) => {
    setValues(prev => new Map(prev).set(categoryId, value))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    // В draft попадает только изменённое
    const changed = new Map<string, number | null>()
    for (const category of activeCategories) {
      const text = values.get(category.id) || ''
      const parsed = parseLimit(text)
      if (parsed === undefined) {
        setError(`«${category.name}»: лимит должен быть больше нуля`)
        return
      }
      const before = initial.has(category.id) ? Number(initial.get(category.id)) : null
      if (parsed !== before) changed.set(category.id, parsed)
    }

    setError(null)
    onSave({ limits: changed })
  }

  return (
    <BottomSheet
      title="Бюджеты"
      onClose={onClose}
      footer={
        <button type="submit" form={FORM_ID} className="budget-save-btn" disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      }
    >
      <form id={FORM_ID} className="budget-form" onSubmit={handleSubmit}>
        <h3>Лимиты на месяц</h3>
        <p className="budget-hint">Считаются по календарному месяцу: остаток делится на дни до конца месяца.</p>
        {activeCategories.length === 0 ? (
          <p className="budget-hint">Нет категорий. Создайте их во вкладке «Аналитика».</p>
        ) : (
          activeCategories.map(category => (
            <div className="budget-field" key={category.id}>
              <label htmlFor={`budget-limit-${category.id}`}>{category.name}</label>
              <ClearableInput
                id={`budget-limit-${category.id}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Без лимита, ₽"
                value={values.get(category.id) || ''}
                onChange={event => setValue(category.id, event.target.value.replace(/[^\d.,\s]/g, ''))}
                onClear={() => setValue(category.id, '')}
                clearLabel={`Очистить лимит «${category.name}»`}
              />
            </div>
          ))
        )}

        {error && <p className="budget-error" role="alert">{error}</p>}
      </form>
    </BottomSheet>
  )
}
