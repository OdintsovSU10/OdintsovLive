import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Pencil } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { Toast } from '../../../components/ui/Toast'
import { useToast } from '../../../hooks/useToast'
import type { Employee, TenderEmployeeEvent } from '../types'
import { getTodayIsoDate, isMissingEmployeeEventsTableError } from '../utils/adminTenderHelpers'
import { getEventsTableAvailable, restoreTenderEmployee, setEventsTableAvailable } from '../utils/tenderArchive'
import './AdminSheets.css'

interface IArchivedEmployeeRow {
  employee: Employee
  archiveReason: string | null
  archiveEventId: number | null
}

interface Props {
  onChanged: () => void
  onClose: () => void
}

const formatDate = (value: string | null): string => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ArchiveSheet({ onChanged, onClose }: Props) {
  const { toast, showToast, hideToast } = useToast()
  const [items, setItems] = useState<IArchivedEmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [savingReason, setSavingReason] = useState(false)

  const notify = (message: string, isError = false) => showToast({
    message,
    tone: isError ? 'error' : 'default',
    duration: isError ? 7000 : 3000
  })

  const loadArchivedEmployees = async () => {
    setLoading(true)
    try {
      const { data: archivedData, error: archivedError } = await supabase
        .from('tender_employees')
        .select('*')
        .eq('is_archived', true)
        .order('full_name', { ascending: true })

      if (archivedError) throw archivedError

      const archivedList = (archivedData || []) as Employee[]
      if (archivedList.length === 0) {
        setItems([])
        return
      }

      if (getEventsTableAvailable() === false) {
        setItems(archivedList.map(employee => ({ employee, archiveReason: null, archiveEventId: null })))
        return
      }

      const { data: eventsData, error: eventsError, status: eventsStatus } = await supabase
        .from('tender_employee_events')
        .select('*')
        .eq('event_type', 'archive')
        .in('employee_id', archivedList.map(employee => employee.id))
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false })

      // События отсортированы от новых к старым — берём первое по каждому сотруднику
      const latestArchiveEventByEmployee = new Map<number, TenderEmployeeEvent>()
      if (eventsError) {
        if (!isMissingEmployeeEventsTableError(eventsError, eventsStatus)) {
          throw eventsError
        }
        setEventsTableAvailable(false)
      } else {
        setEventsTableAvailable(true)
        ;((eventsData || []) as TenderEmployeeEvent[]).forEach(event => {
          if (!latestArchiveEventByEmployee.has(event.employee_id)) {
            latestArchiveEventByEmployee.set(event.employee_id, event)
          }
        })
      }

      setItems(archivedList.map(employee => {
        const event = latestArchiveEventByEmployee.get(employee.id)
        return {
          employee,
          archiveReason: event?.note || null,
          archiveEventId: event?.id ?? null
        }
      }))
    } catch (err) {
      console.error('Error loading archived employees:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadArchivedEmployees()
  }, [])

  const handleRestore = async (item: IArchivedEmployeeRow) => {
    const { id } = item.employee
    setRestoringId(id)
    try {
      await restoreTenderEmployee(id)
      setItems(prev => prev.filter(row => row.employee.id !== id))
      onChanged()
      notify('Сотрудник возвращён из архива')
    } catch (err) {
      console.error('Error restoring employee:', err)
      notify('Ошибка при восстановлении', true)
    } finally {
      setRestoringId(null)
    }
  }

  const startEdit = (item: IArchivedEmployeeRow) => {
    setEditingId(item.employee.id)
    setDraft(item.archiveReason || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    // Esc отменяет только правку, лист остаётся открытым
    event.stopPropagation()
    cancelEdit()
  }

  const handleSaveReason = async (event: FormEvent, item: IArchivedEmployeeRow) => {
    event.preventDefault()
    if (savingReason) return
    if (getEventsTableAvailable() === false) {
      notify('Таблица событий недоступна — причину не сохранить', true)
      return
    }

    const note = draft.trim() || null
    setSavingReason(true)
    try {
      let eventId = item.archiveEventId
      if (eventId !== null) {
        const { error, status } = await supabase
          .from('tender_employee_events')
          .update({ note })
          .eq('id', eventId)
        if (error) {
          if (isMissingEmployeeEventsTableError(error, status)) setEventsTableAvailable(false)
          throw error
        }
      } else {
        const { data, error, status } = await supabase
          .from('tender_employee_events')
          .insert({
            employee_id: item.employee.id,
            event_type: 'archive',
            event_date: item.employee.archived_at ? item.employee.archived_at.slice(0, 10) : getTodayIsoDate(),
            note
          })
          .select('id')
          .single()
        if (error) {
          if (isMissingEmployeeEventsTableError(error, status)) setEventsTableAvailable(false)
          throw error
        }
        eventId = (data as { id: number }).id
      }

      setItems(prev => prev.map(row => (
        row.employee.id === item.employee.id ? { ...row, archiveReason: note, archiveEventId: eventId } : row
      )))
      cancelEdit()
      onChanged()
      notify('Причина сохранена')
    } catch (err) {
      console.error('Error saving archive reason:', err)
      notify('Ошибка при сохранении причины', true)
    } finally {
      setSavingReason(false)
    }
  }

  return (
    <BottomSheet title={`Архив (${items.length})`} onClose={onClose}>
      {loading ? (
        <div className="tsh-loading"><div className="tender-spinner" /></div>
      ) : items.length === 0 ? (
        <div className="tsh-empty">Архив пуст</div>
      ) : (
        <ul className="tsh-list">
          {items.map(item => {
            const { employee } = item
            const isEditing = editingId === employee.id
            const subtitle = [employee.position, employee.subdivision].filter(Boolean).join(' · ')
            return (
              <li key={employee.id} className="tsh-card">
                <div className="tsh-card-head">
                  <div className="tsh-card-title">
                    <strong>{employee.full_name}</strong>
                    {subtitle && <span>{subtitle}</span>}
                  </div>
                  <button
                    type="button"
                    className="tsh-btn"
                    onClick={() => handleRestore(item)}
                    disabled={restoringId === employee.id}
                  >
                    {restoringId === employee.id ? 'Возврат…' : 'Вернуть'}
                  </button>
                </div>
                <div className="tsh-card-meta">В архиве с {formatDate(employee.archived_at)}</div>
                {isEditing ? (
                  <form className="tsh-reason-form" onSubmit={event => handleSaveReason(event, item)}>
                    <ClearableInput
                      wrapperClassName="tsh-field"
                      value={draft}
                      onChange={event => setDraft(event.target.value)}
                      onClear={() => setDraft('')}
                      onKeyDown={handleDraftKeyDown}
                      clearLabel="Очистить причину"
                      placeholder="Причина архивации"
                      aria-label={`Причина: ${employee.full_name}`}
                      autoComplete="off"
                      autoFocus
                    />
                    <div className="tsh-reason-actions">
                      <button type="button" className="tsh-btn" onClick={cancelEdit} disabled={savingReason}>Отмена</button>
                      <button type="submit" className="tsh-btn primary" disabled={savingReason}>
                        {savingReason ? 'Сохраняю…' : 'Сохранить'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="tsh-reason">
                    <span className="tsh-reason-text">Причина: {item.archiveReason || '—'}</span>
                    <button
                      type="button"
                      className="tsh-icon-btn"
                      onClick={() => startEdit(item)}
                      aria-label={`Изменить причину: ${employee.full_name}`}
                      title="Изменить причину"
                    >
                      <Pencil size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Toast toast={toast} onClose={hideToast} />
    </BottomSheet>
  )
}
