import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Bell, Check, Mic, Trash2, X } from 'lucide-react'
import { ClearableInput } from '../../components/ui/ClearableInput'
import { formatDueLabel, formatRemindLabel, isOverdue, moscowTime, toMoscowISO } from './todoDates'
import type { TodoItem } from './types'

interface Props {
  item: TodoItem
  today: string
  onToggle: (item: TodoItem) => void
  onDelete: (item: TodoItem) => void
  onSave: (item: TodoItem, title: string, dueDate: string | null, remindAt: string | null) => Promise<boolean>
}

export const TodoRow = ({ item, today, onToggle, onDelete, onSave }: Props) => {
  const isDone = item.done_at !== null
  const overdue = !isDone && isOverdue(item, today)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [dueDate, setDueDate] = useState(item.due_date ?? '')
  const [dueTime, setDueTime] = useState(item.remind_at ? moscowTime(item.remind_at) : '')

  const startEdit = () => {
    setTitle(item.title)
    setDueDate(item.due_date ?? '')
    setDueTime(item.remind_at ? moscowTime(item.remind_at) : '')
    setEditing(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const date = dueDate || (dueTime ? today : '')
    const ok = await onSave(item, trimmed, date || null, dueTime ? toMoscowISO(date, dueTime) : null)
    if (ok) setEditing(false)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <li className="todo-row editing">
        <form className="todo-edit" onSubmit={event => void handleSubmit(event)} onKeyDown={handleKeyDown}>
          <ClearableInput
            className="todo-input"
            type="text"
            value={title}
            clearLabel="Очистить название"
            aria-label="Название дела"
            autoFocus
            maxLength={300}
            onChange={event => setTitle(event.target.value)}
            onClear={() => setTitle('')}
          />
          <div className="todo-edit-row">
            <div className="todo-edit-fields">
              <input
                className="todo-input todo-date-input"
                type="date"
                value={dueDate}
                aria-label="Срок"
                onChange={event => setDueDate(event.target.value)}
              />
              <input
                className="todo-input todo-date-input todo-time-input"
                type="time"
                value={dueTime}
                aria-label="Время"
                onChange={event => setDueTime(event.target.value)}
              />
            </div>
            <button type="submit" className="todo-icon-btn" aria-label="Сохранить" disabled={!title.trim()}>
              <Check size={20} strokeWidth={1.5} />
            </button>
            <button type="button" className="todo-icon-btn" aria-label="Отмена" onClick={() => setEditing(false)}>
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className={`todo-row ${isDone ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <button
        type="button"
        className={`todo-check ${isDone ? 'checked' : ''}`}
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? `Вернуть в открытые: ${item.title}` : `Отметить сделанным: ${item.title}`}
        onClick={() => onToggle(item)}
      >
        <span className="todo-check-circle">
          <Check size={14} strokeWidth={2.5} />
        </span>
      </button>

      {isDone ? (
        <div className="todo-main">
          <span className="todo-title">{item.title}</span>
        </div>
      ) : (
        <button type="button" className="todo-main todo-main-btn" onClick={startEdit} aria-label={`Изменить: ${item.title}`}>
          <span className="todo-title">{item.title}</span>
          {item.remind_at ? (
            <span className="todo-remind">
              <Bell size={12} strokeWidth={1.5} />
              {formatRemindLabel(item.remind_at, today)}
            </span>
          ) : (
            item.due_date && <span className="todo-due">{formatDueLabel(item.due_date, today)}</span>
          )}
        </button>
      )}

      {item.source === 'telegram' && (
        <span className="todo-source" title="Добавлено голосом через бота" aria-label="Добавлено через бота">
          <Mic size={14} strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}

      <button type="button" className="todo-icon-btn todo-delete" aria-label={`Удалить: ${item.title}`} onClick={() => onDelete(item)}>
        <Trash2 size={18} strokeWidth={1.5} />
      </button>
    </li>
  )
}
