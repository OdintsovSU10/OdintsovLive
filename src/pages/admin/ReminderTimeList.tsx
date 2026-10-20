import { X } from 'lucide-react'
import './ReminderSettings.css'

interface ReminderTimeListProps {
  label: string
  times: string[]
  disabled: boolean
  onChange: (times: string[]) => void
}

export default function ReminderTimeList({ label, times, disabled, onChange }: ReminderTimeListProps) {
  const updateTime = (index: number, value: string) => {
    onChange(times.map((time, i) => (i === index ? value : time)))
  }

  const removeTime = (index: number) => {
    onChange(times.filter((_, i) => i !== index))
  }

  return (
    <div className="reminder-field">
      <span className="reminder-field-label">{label}</span>
      <div className="reminder-rows">
        {times.map((time, index) => (
          <div className="reminder-row" key={index}>
            <input
              type="time"
              value={time}
              onChange={event => updateTime(index, event.target.value)}
              aria-label={`${label}: время ${index + 1}`}
              disabled={disabled}
            />
            <button
              type="button"
              className="reminder-icon-btn"
              onClick={() => removeTime(index)}
              aria-label="Удалить время"
              title="Удалить время"
              disabled={disabled}
            >
              <X size={18} />
            </button>
          </div>
        ))}
        {times.length === 0 && <span className="reminder-empty">Не напоминать</span>}
      </div>
      <button
        type="button"
        className="reminder-add-btn"
        onClick={() => onChange([...times, ''])}
        disabled={disabled}
      >
        + время
      </button>
    </div>
  )
}
