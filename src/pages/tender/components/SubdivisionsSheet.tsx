import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import { Toast } from '../../../components/ui/Toast'
import { useToast } from '../../../hooks/useToast'
import type { Employee, TenderSubdivision } from '../types'
import { normalizeSubdivisionName } from '../utils/adminTenderHelpers'
import './AdminSheets.css'

interface Props {
  subdivisions: TenderSubdivision[]
  // Активные сотрудники — по ним считаем, можно ли удалить подразделение
  employees: Employee[]
  onChanged: () => void | Promise<void>
  onClose: () => void
}

const HAS_EMPLOYEES_HINT = 'Есть сотрудники — сначала переведите их'
const NO_RECORD_HINT = 'Название взято из карточек сотрудников, записи в справочнике нет'

export function SubdivisionsSheet({ subdivisions, employees, onChanged, onClose }: Props) {
  const { toast, showToast, hideToast } = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const notify = (message: string, isError = false) => showToast({
    message,
    tone: isError ? 'error' : 'default',
    duration: isError ? 7000 : 3000
  })

  const employeeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    employees.forEach(employee => {
      if (employee.is_archived) return
      const key = normalizeSubdivisionName(employee.subdivision || '')
      if (key) counts.set(key, (counts.get(key) || 0) + 1)
    })
    return counts
  }, [employees])

  const closeForm = () => {
    setAdding(false)
    setName('')
  }

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      notify('Введите название подразделения')
      return
    }

    const normalized = normalizeSubdivisionName(trimmed)
    if (subdivisions.some(item => normalizeSubdivisionName(item.name) === normalized)) {
      notify('Такое подразделение уже существует')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('tender_subdivisions').insert({ name: trimmed })
      if (error) throw error
      closeForm()
      await onChanged()
      notify('Подразделение добавлено')
    } catch (err) {
      console.error('Error adding subdivision:', err)
      notify('Ошибка при добавлении подразделения', true)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: TenderSubdivision) => {
    setDeletingId(item.id)
    try {
      const { error } = await supabase.from('tender_subdivisions').delete().eq('id', item.id)
      if (error) throw error
      setConfirmId(null)
      await onChanged()
      notify('Подразделение удалено')
    } catch (err) {
      console.error('Error deleting subdivision:', err)
      notify('Ошибка при удалении подразделения', true)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <BottomSheet title={`Подразделения (${subdivisions.length})`} onClose={onClose}>
      {adding ? (
        <form className="tsh-add-form" onSubmit={handleAdd}>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={name}
            onChange={event => setName(event.target.value)}
            onClear={() => setName('')}
            clearLabel="Очистить название"
            placeholder="Название"
            aria-label="Название подразделения"
            autoComplete="off"
            autoFocus
          />
          <div className="tsh-reason-actions">
            <button type="button" className="tsh-btn" onClick={closeForm} disabled={saving}>Отмена</button>
            <button type="submit" className="tsh-btn primary" disabled={saving || name.trim().length === 0}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="tsh-btn primary tsh-add-btn" onClick={() => setAdding(true)}>
          <Plus size={18} strokeWidth={1.5} />
          <span>Добавить</span>
        </button>
      )}

      {subdivisions.length === 0 ? (
        <div className="tsh-empty">Подразделения не найдены</div>
      ) : (
        <ul className="tsh-list">
          {subdivisions.map(item => {
            const count = employeeCounts.get(normalizeSubdivisionName(item.name)) || 0
            const hasRecord = item.id > 0
            const canDelete = count === 0 && hasRecord
            const confirming = confirmId === item.id
            const hint = count > 0 ? HAS_EMPLOYEES_HINT : hasRecord ? `Удалить подразделение: ${item.name}` : NO_RECORD_HINT
            return (
              <li key={item.id} className="tsh-card">
                <div className="tsh-card-head">
                  <div className="tsh-card-title">
                    <strong>{item.name}</strong>
                    <span>Сотрудников: {count}</span>
                  </div>
                  {!confirming && (
                    <button
                      type="button"
                      className="tsh-icon-btn danger"
                      onClick={() => setConfirmId(item.id)}
                      disabled={!canDelete}
                      title={hint}
                      aria-label={`Удалить подразделение: ${item.name}`}
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
                {confirming && (
                  <div className="tsh-confirm-inline">
                    <span>Удалить «{item.name}»? Это действие нельзя отменить.</span>
                    <div className="tsh-reason-actions">
                      <button type="button" className="tsh-btn" onClick={() => setConfirmId(null)} disabled={deletingId === item.id}>
                        Отмена
                      </button>
                      <button type="button" className="tsh-btn danger" onClick={() => handleDelete(item)} disabled={deletingId === item.id}>
                        {deletingId === item.id ? 'Удаляю…' : 'Удалить'}
                      </button>
                    </div>
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
