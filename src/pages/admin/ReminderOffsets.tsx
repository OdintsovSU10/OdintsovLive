import { useState } from 'react'
import { X } from 'lucide-react'
import { MAX_OFFSET_MIN, MAX_OFFSETS } from './reminderDefaults'
import './ReminderSettings.css'

interface ReminderOffsetsProps {
  offsets: number[]
  disabled: boolean
  onChange: (offsets: number[]) => void
}

type Unit = 'min' | 'h'

// Что подставить по кнопке «+ напоминание»: сначала «в срок», затем первое свободное значение
const NEXT_OFFSETS = [0, 30, 15, 60, 120, 10, 180, 1440]

const splitOffset = (minutes: number): { value: number; unit: Unit } =>
  minutes > 0 && minutes % 60 === 0 ? { value: minutes / 60, unit: 'h' } : { value: minutes, unit: 'min' }

interface OffsetRowProps {
  minutes: number
  disabled: boolean
  onChange: (minutes: number) => void
  onRemove: () => void
}

function OffsetRow({ minutes, disabled, onChange, onRemove }: OffsetRowProps) {
  const { value, unit } = splitOffset(minutes)
  const [text, setText] = useState(String(value))
  const [chosenUnit, setChosenUnit] = useState<Unit>(unit)

  const commit = (nextText: string, nextUnit: Unit) => {
    const number = Number(nextText)
    if (!Number.isInteger(number) || number < 1) return
    const next = nextUnit === 'h' ? number * 60 : number
    if (next <= MAX_OFFSET_MIN) onChange(next)
  }

  if (minutes === 0) {
    return (
      <div className="reminder-row">
        <span className="reminder-offset-fixed">в срок</span>
        <button type="button" className="reminder-icon-btn" onClick={onRemove} aria-label="Удалить напоминание" title="Удалить напоминание" disabled={disabled}>
          <X size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="reminder-row">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={chosenUnit === 'h' ? MAX_OFFSET_MIN / 60 : MAX_OFFSET_MIN}
        value={text}
        onChange={event => {
          setText(event.target.value)
          commit(event.target.value, chosenUnit)
        }}
        onBlur={() => {
          const current = splitOffset(minutes)
          setText(String(current.value))
          setChosenUnit(current.unit)
        }}
        aria-label="За сколько напомнить"
        disabled={disabled}
      />
      <select
        value={chosenUnit}
        onChange={event => {
          const nextUnit = event.target.value as Unit
          setChosenUnit(nextUnit)
          commit(text, nextUnit)
        }}
        aria-label="Единица времени"
        disabled={disabled}
      >
        <option value="min">мин</option>
        <option value="h">ч</option>
      </select>
      <button type="button" className="reminder-icon-btn" onClick={onRemove} aria-label="Удалить напоминание" title="Удалить напоминание" disabled={disabled}>
        <X size={18} />
      </button>
    </div>
  )
}

export default function ReminderOffsets({ offsets, disabled, onChange }: ReminderOffsetsProps) {
  const addOffset = () => {
    const next = NEXT_OFFSETS.find(item => !offsets.includes(item))
    if (next !== undefined) onChange([...offsets, next])
  }

  return (
    <div className="reminder-field">
      <span className="reminder-field-label">За сколько напомнить</span>
      <div className="reminder-rows">
        {offsets.map((minutes, index) => (
          <OffsetRow
            // строки хранят текст поля у себя: при добавлении/удалении ключ меняется, и они пересоздаются
            key={`${offsets.length}-${index}`}
            minutes={minutes}
            disabled={disabled}
            onChange={next => onChange(offsets.map((item, i) => (i === index ? next : item)))}
            onRemove={() => onChange(offsets.filter((_, i) => i !== index))}
          />
        ))}
        {offsets.length === 0 && <span className="reminder-empty">Не напоминать</span>}
      </div>
      <button
        type="button"
        className="reminder-add-btn"
        onClick={addOffset}
        disabled={disabled || offsets.length >= MAX_OFFSETS}
      >
        + напоминание
      </button>
      <p className="fot-token-help">Напоминания приходят за выбранное время до срока дела.</p>
    </div>
  )
}
