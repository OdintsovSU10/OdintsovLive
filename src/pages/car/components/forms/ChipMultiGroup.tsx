import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'

interface Option {
  key: string
  label: string
}

interface Props {
  label: string
  options: Option[]
  values: string[]
  onChange: (values: string[]) => void
  hint?: string
  // Свой вариант прямо из формы: чип «Другое» раскрывает поле с названием
  onCreate?: (label: string) => Promise<void>
  createPlaceholder?: string
}

// Чипы с несколькими отметками сразу: повторный тап снимает выбор
export function ChipMultiGroup({ label, options, values, onChange, hint, onCreate, createPlaceholder }: Props) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (key: string) =>
    onChange(values.includes(key) ? values.filter(value => value !== key) : [...values, key])

  const create = async () => {
    const name = draft.trim()
    if (!name || busy || !onCreate) return
    setBusy(true)
    await onCreate(name)
    setBusy(false)
    setDraft('')
    setAdding(false)
  }

  // Enter в поле добавляет вариант, а не отправляет всю форму
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void create()
  }

  return (
    <div className="car-field">
      <span className="car-field-label">{label}</span>
      <div className="car-chips" role="group" aria-label={label}>
        {options.map(option => {
          const active = values.includes(option.key)
          return (
            <button
              key={option.key}
              type="button"
              className={`car-chip ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => toggle(option.key)}
            >
              {option.label}
            </button>
          )
        })}
        {onCreate && (
          <button type="button" className="car-chip add" aria-expanded={adding} onClick={() => setAdding(prev => !prev)}>
            <Plus size={16} aria-hidden="true" />
            <span>Другое</span>
          </button>
        )}
      </div>
      {onCreate && adding && (
        <div className="car-chip-create">
          <input
            type="text"
            autoFocus
            autoComplete="off"
            placeholder={createPlaceholder}
            aria-label={`${label}: свой вариант`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="car-btn ghost" disabled={!draft.trim() || busy} onClick={() => void create()}>
            Добавить
          </button>
        </div>
      )}
      {hint && <p className="car-field-hint">{hint}</p>}
    </div>
  )
}
