import { X } from 'lucide-react'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { LIFE_EVENT_COLORS, MAX_LIFE_EVENT_LABEL, MAX_LIFE_EVENTS, type ILifeEvent } from './reminderDefaults'
import './ReminderSettings.css'

interface ILifeEventsProps {
  events: ILifeEvent[]
  disabled: boolean
  onChange: (events: ILifeEvent[]) => void
}

// Цвет события = его место среди событий с датой, отсортированных по дате (как в боте)
const colorOf = (events: ILifeEvent[], index: number): string | undefined => {
  const { date } = events[index]
  if (!date) return undefined
  const rank = events.filter((event, i) => event.date && (event.date < date || (event.date === date && i < index))).length
  return LIFE_EVENT_COLORS[rank]
}

export default function LifeEvents({ events, disabled, onChange }: ILifeEventsProps) {
  const updateEvent = (index: number, patch: Partial<ILifeEvent>) => {
    onChange(events.map((event, i) => (i === index ? { ...event, ...patch } : event)))
  }

  const removeEvent = (index: number) => {
    onChange(events.filter((_, i) => i !== index))
  }

  return (
    <div className="reminder-field">
      <span className="reminder-field-label">Памятные даты</span>
      <div className="reminder-rows">
        {events.map((event, index) => {
          const color = colorOf(events, index)
          return (
            <div className="life-event-row" key={index}>
              <span
                className="life-event-dot"
                style={color ? { background: color } : undefined}
                aria-hidden="true"
              />
              <input
                className="life-event-date"
                type="date"
                min="1900-01-01"
                value={event.date}
                onChange={e => updateEvent(index, { date: e.target.value })}
                aria-label={`Памятная дата ${index + 1}: дата`}
                disabled={disabled}
              />
              <ClearableInput
                wrapperClassName="life-event-label"
                type="text"
                value={event.label}
                maxLength={MAX_LIFE_EVENT_LABEL}
                placeholder="Название"
                autoComplete="off"
                aria-label={`Памятная дата ${index + 1}: название`}
                clearLabel="Очистить название"
                onChange={e => updateEvent(index, { label: e.target.value })}
                onClear={() => updateEvent(index, { label: '' })}
                disabled={disabled}
              />
              <button
                type="button"
                className="reminder-icon-btn life-event-remove"
                onClick={() => removeEvent(index)}
                aria-label="Удалить дату"
                title="Удалить дату"
                disabled={disabled}
              >
                <X size={18} />
              </button>
            </div>
          )
        })}
        {events.length === 0 && <span className="reminder-empty">Нет памятных дат</span>}
      </div>
      {events.length < MAX_LIFE_EVENTS && (
        <button
          type="button"
          className="reminder-add-btn"
          onClick={() => onChange([...events, { date: '', label: '' }])}
          disabled={disabled}
        >
          Добавить дату
        </button>
      )}
      <p className="fot-token-help">Неделя с такой датой закрашивается своим цветом, подписи — под картинкой</p>
    </div>
  )
}
