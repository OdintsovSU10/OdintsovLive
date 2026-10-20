import { useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { ClearableInput } from '../components/ui/ClearableInput'
import { Toast } from '../components/ui/Toast'
import { useToast } from '../hooks/useToast'
import { TodoRow } from './todo/TodoRow'
import { getMoscowToday, sortOpen, toMoscowISO } from './todo/todoDates'
import type { TodoItem } from './todo/types'
import { useTodos } from './todo/useTodos'
import './TodoPage.css'

const UNDO_DURATION_MS = 6000

export default function TodoPage() {
  const { open, done, loading, error, add, update, setDoneState, remove, restore } = useTodos()
  const { toast, showToast, hideToast } = useToast()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [adding, setAdding] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)

  const today = getMoscowToday()
  const sortedOpen = useMemo(() => sortOpen(open), [open])

  const failToast = (message = 'Не удалось сохранить') => showToast({ message, tone: 'error' })

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || adding) return

    setAdding(true)
    const date = dueDate || (dueTime ? today : '')
    const ok = await add(trimmed, date || null, dueTime ? toMoscowISO(date, dueTime) : null)
    setAdding(false)
    if (!ok) return failToast('Не удалось добавить')
    setTitle('')
    setDueDate('')
    setDueTime('')
  }

  const handleToggle = async (item: TodoItem) => {
    const markDone = item.done_at === null
    const ok = await setDoneState(item, markDone)
    if (!ok) return failToast()
    if (markDone) {
      showToast({
        message: `Сделано: ${item.title}`,
        actionLabel: 'Отменить',
        duration: UNDO_DURATION_MS,
        onAction: () => { void setDoneState(item, false) }
      })
    }
  }

  const handleDelete = async (item: TodoItem) => {
    const ok = await remove(item)
    if (!ok) return failToast('Не удалось удалить')
    showToast({
      message: `Удалено: ${item.title}`,
      actionLabel: 'Отменить',
      duration: UNDO_DURATION_MS,
      onAction: () => { void restore(item) }
    })
  }

  const handleSave = async (item: TodoItem, nextTitle: string, nextDue: string | null, nextRemindAt: string | null) => {
    const ok = await update(item.id, { title: nextTitle, due_date: nextDue, remind_at: nextRemindAt })
    if (!ok) failToast()
    return ok
  }

  return (
    <div className="todo-page">
      <header className="todo-header">
        <h1>Дела</h1>
      </header>

      <form className="todo-add" onSubmit={event => void handleAdd(event)}>
        <ClearableInput
          className="todo-input"
          wrapperClassName="todo-add-title"
          type="text"
          value={title}
          placeholder="Что сделать?"
          aria-label="Что сделать?"
          clearLabel="Очистить название"
          maxLength={300}
          autoComplete="off"
          enterKeyHint="done"
          onChange={event => setTitle(event.target.value)}
          onClear={() => setTitle('')}
        />
        <div className="todo-add-row">
          <label className="todo-date-field">
            <span>Срок (необязательно)</span>
            <input
              className="todo-input todo-date-input"
              type="date"
              value={dueDate}
              onChange={event => setDueDate(event.target.value)}
            />
          </label>
          <label className="todo-date-field todo-time-field">
            <span>Время (необязательно)</span>
            <input
              className="todo-input todo-date-input todo-time-input"
              type="time"
              value={dueTime}
              onChange={event => setDueTime(event.target.value)}
            />
          </label>
          <button type="submit" className="todo-add-btn" disabled={!title.trim() || adding}>
            Добавить
          </button>
        </div>
      </form>

      {error && (
        <div className="todo-alert" role="alert">
          <AlertCircle size={16} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="todo-skeleton" aria-busy="true" />
      ) : sortedOpen.length === 0 ? (
        <p className="todo-empty">Дел нет. Добавь здесь или скажи боту голосом: «напомни купить фильтр в субботу»</p>
      ) : (
        <ul className="todo-list">
          {sortedOpen.map(item => (
            <TodoRow
              key={item.id}
              item={item}
              today={today}
              onToggle={target => void handleToggle(target)}
              onDelete={target => void handleDelete(target)}
              onSave={handleSave}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section className="todo-done">
          <button
            type="button"
            className={`todo-done-toggle ${doneOpen ? 'open' : ''}`}
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen(prev => !prev)}
          >
            <span>Сделано ({done.length})</span>
            <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {doneOpen && (
            <ul className="todo-list todo-done-list">
              {done.map(item => (
                <TodoRow
                  key={item.id}
                  item={item}
                  today={today}
                  onToggle={target => void handleToggle(target)}
                  onDelete={target => void handleDelete(target)}
                  onSave={handleSave}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <Toast toast={toast} onClose={hideToast} />
    </div>
  )
}
