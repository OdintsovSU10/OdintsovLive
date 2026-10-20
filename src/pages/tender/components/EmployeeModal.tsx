import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useOverlayClose } from '../../../hooks/useOverlayClose'
import { formatRuPhone } from '../../../lib/formatUtils'
import type { SalaryHistory } from '../types'
import {
  formatAgeYears,
  formatMonthsSinceRaise,
  getAgeFromBirthDate,
  getDurationHighlightColor,
  getNoRaiseColor
} from '../utils/tenderPresentation'
import {
  formatMoneyInput,
  getEffectiveSalaryForDate,
  getNoRaiseMonthsFromHistory,
  getTenureMonthsFromHistory,
  getTodayIsoDate,
  normalizeSubdivisionName,
  parseMoneyInput,
  type EditableEmployee
} from '../utils/adminTenderHelpers'
import '../TenderPage.css'
import './EmployeeModal.css'

interface NewSalaryEntry {
  salary: number
  effective_date: string
  note: string
}

export function EmployeeModal({ employee, onClose, onSave, onSalaryHistoryChange, onArchive, subdivisions }: {
  employee: EditableEmployee
  onClose: () => void
  onSave: (emp: EditableEmployee) => void
  onSalaryHistoryChange: () => void
  onArchive: (id: number, reason: string) => Promise<void>
  subdivisions: string[]
}) {
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<EditableEmployee>(employee)
  const [saving, setSaving] = useState(false)
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showAddSalary, setShowAddSalary] = useState(false)
  const [displaySalary, setDisplaySalary] = useState(employee.current_salary)
  const [newSalary, setNewSalary] = useState<NewSalaryEntry>({
    salary: employee.current_salary,
    effective_date: getTodayIsoDate(),
    note: 'Повышение оклада'
  })
  const [savingSalary, setSavingSalary] = useState(false)
  const [showArchiveReasonModal, setShowArchiveReasonModal] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)
  const salaryHistoryChronological = useMemo(() => (
    [...salaryHistory].sort((left, right) => (
      new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime()
    ))
  ), [salaryHistory])
  const noRaiseMonths = useMemo(
    () => getNoRaiseMonthsFromHistory(salaryHistoryChronological, employee.hire_date),
    [employee.hire_date, salaryHistoryChronological]
  )
  const tenureMonths = useMemo(
    () => getTenureMonthsFromHistory(salaryHistoryChronological, employee.hire_date),
    [employee.hire_date, salaryHistoryChronological]
  )
  const employeeAgeYears = useMemo(
    () => getAgeFromBirthDate(employee.birth_date),
    [employee.birth_date]
  )
  const subdivisionOptions = useMemo(() => {
    const map = new Map<string, string>()
    subdivisions.forEach(name => map.set(normalizeSubdivisionName(name), name))
    if (form.subdivision.trim() && !map.has(normalizeSubdivisionName(form.subdivision))) {
      map.set(normalizeSubdivisionName(form.subdivision), form.subdivision)
    }
    return Array.from(map.values()).sort((left, right) => left.localeCompare(right, 'ru-RU'))
  }, [form.subdivision, subdivisions])

  useEffect(() => {
    loadSalaryHistory()
  }, [employee.id])

  const loadSalaryHistory = async () => {
    setLoadingHistory(true)
    try {
      const { data } = await supabase
        .from('tender_salary_history')
        .select('*')
        .eq('employee_id', employee.id)
        .order('effective_date', { ascending: false })
      const loadedHistory = data || []
      setSalaryHistory(loadedHistory)

      const effectiveTodaySalary = getEffectiveSalaryForDate(
        loadedHistory,
        employee.current_salary,
        getTodayIsoDate()
      )
      setDisplaySalary(effectiveTodaySalary)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleChange = (field: keyof EditableEmployee, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  const handleAddSalary = async () => {
    if (!newSalary.salary || !newSalary.effective_date) return
    setSavingSalary(true)
    try {
      const { error } = await supabase
        .from('tender_salary_history')
        .insert({
          employee_id: employee.id,
          salary: newSalary.salary,
          effective_date: newSalary.effective_date,
          note: newSalary.note || null
        })
      if (error) throw error

      // Обновляем текущий оклад только если дата повышения уже наступила.
      if (newSalary.effective_date <= getTodayIsoDate()) {
        const { error: updateError } = await supabase
          .from('tender_employees')
          .update({ current_salary: newSalary.salary })
          .eq('id', employee.id)
        if (updateError) throw updateError
      }

      await loadSalaryHistory()
      onSalaryHistoryChange()
      setShowAddSalary(false)
      setNewSalary({ salary: newSalary.salary, effective_date: getTodayIsoDate(), note: 'Повышение оклада' })
    } catch (err) {
      console.error('Error adding salary:', err)
    } finally {
      setSavingSalary(false)
    }
  }

  const handleDeleteSalary = async (id: number) => {
    if (!confirm('Удалить запись?')) return
    try {
      await supabase.from('tender_salary_history').delete().eq('id', id)
      await loadSalaryHistory()
      onSalaryHistoryChange()
    } catch (err) {
      console.error('Error deleting salary:', err)
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  }

  const formatDate = (date: string) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const handleArchive = async () => {
    const reason = archiveReason.trim()
    if (!reason) return
    setArchiving(true)
    try {
      await onArchive(employee.id, reason)
      setShowArchiveReasonModal(false)
      setArchiveReason('')
    } catch {
      // Ошибку и уведомление показывает родительский компонент.
    } finally {
      setArchiving(false)
    }
  }

  const closeArchiveReasonModal = () => {
    if (archiving) return
    setShowArchiveReasonModal(false)
    setArchiveReason('')
  }

  const overlayClose = useOverlayClose(onClose)
  const archiveOverlayClose = useOverlayClose(closeArchiveReasonModal)

  // Режим редактирования
  if (editMode) {
    return (
      <div className="modal-overlay" {...overlayClose}>
        <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Редактирование</h3>
            <button className="modal-close" onClick={() => setEditMode(false)}>✕</button>
          </div>
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="edit-form-grid">
              <div className="form-group">
                <label>Фамилия</label>
                <input value={form.last_name} onChange={e => handleChange('last_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Имя</label>
                <input value={form.first_name} onChange={e => handleChange('first_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Отчество</label>
                <input value={form.middle_name} onChange={e => handleChange('middle_name', e.target.value)} />
              </div>
              <div className="form-group form-group-full">
                <label>ФИО (полное)</label>
                <input value={form.full_name} onChange={e => handleChange('full_name', e.target.value)} />
              </div>
              <div className="form-group form-group-full">
                <label>Должность</label>
                <input value={form.position} onChange={e => handleChange('position', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Отдел</label>
                <input value={form.department} onChange={e => handleChange('department', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Подразделение</label>
                <select value={form.subdivision} onChange={e => handleChange('subdivision', e.target.value)}>
                  <option value="">— Без подразделения —</option>
                  {subdivisionOptions.map(subdivision => (
                    <option key={subdivision} value={subdivision}>
                      {subdivision}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Оклад</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatMoneyInput(form.current_salary)}
                  onChange={e => handleChange('current_salary', parseMoneyInput(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Ежемес. бонус</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatMoneyInput(form.monthly_bonus)}
                  onChange={e => handleChange('monthly_bonus', parseMoneyInput(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Компания</label>
                <input value={form.company} onChange={e => handleChange('company', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Дата приёма</label>
                <input type="date" value={form.hire_date} onChange={e => handleChange('hire_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Дата рождения</label>
                <input type="date" value={form.birth_date} onChange={e => handleChange('birth_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Телефон</label>
                <input value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
              </div>
              <div className="form-group">
                <label>СНИЛС</label>
                <input value={form.snils} onChange={e => handleChange('snils', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Страна</label>
                <input value={form.country} onChange={e => handleChange('country', e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditMode(false)}>Отмена</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Режим просмотра
  return (
    <div className="modal-overlay" {...overlayClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="emp-detail-header">
            <div className="emp-avatar emp-avatar-lg">{getInitials(employee.full_name)}</div>
            <div>
              <h3 className="emp-detail-name">{employee.full_name}</h3>
              <div className="emp-detail-position">{employee.position}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Основная информация */}
          <div className="emp-detail-tags">
            {employee.department && <span className="emp-tag emp-tag-dept">{employee.department}</span>}
            {employee.company && <span className="emp-tag emp-tag-date">{employee.company}</span>}
          </div>

          <div className="emp-detail-grid">
            <div className="emp-detail-card">
              <div className="emp-detail-label">Оклад</div>
              <div className="emp-detail-value" style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>
                {displaySalary.toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Ежемесячный бонус</div>
              <div className="emp-detail-value" style={{ color: 'var(--primary)' }}>
                {employee.monthly_bonus.toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Дата приёма</div>
              <div className="emp-detail-value">{formatDate(employee.hire_date)}</div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Без повышения</div>
              <div className="emp-detail-value" style={{ color: getNoRaiseColor(noRaiseMonths) }}>
                {formatMonthsSinceRaise(noRaiseMonths)}
              </div>
            </div>
            <div className="emp-detail-card">
              <div className="emp-detail-label">Стаж в компании</div>
              <div className="emp-detail-value" style={{ color: getDurationHighlightColor(tenureMonths) }}>
                {formatMonthsSinceRaise(tenureMonths)}
              </div>
            </div>
            {employee.birth_date && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">Дата рождения</div>
                <div className="emp-detail-value">
                  {formatDate(employee.birth_date)}
                  {employeeAgeYears !== null && (
                    <span className="emp-detail-age-inline"> ({formatAgeYears(employeeAgeYears)})</span>
                  )}
                </div>
              </div>
            )}
            <div className="emp-detail-card">
              <div className="emp-detail-label">Телефон</div>
              <div className="emp-detail-value">{formatRuPhone(employee.phone, { dash: true })}</div>
            </div>
            {employee.email && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">Email</div>
                <div className="emp-detail-value">{employee.email}</div>
              </div>
            )}
            {employee.snils && (
              <div className="emp-detail-card">
                <div className="emp-detail-label">СНИЛС</div>
                <div className="emp-detail-value">{employee.snils}</div>
              </div>
            )}
          </div>

          {/* История окладов */}
          <div className="salary-history-section">
            <div className="salary-history-header">
              <h4>История окладов</h4>
              <button type="button" className="btn-small btn-primary" onClick={() => setShowAddSalary(true)}>
                Повысить оклад
              </button>
            </div>

            {showAddSalary && (
              <div className="add-salary-form">
                <div className="add-salary-grid">
                  <div className="form-group">
                    <label>Новый оклад</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatMoneyInput(newSalary.salary)}
                      onChange={e => setNewSalary(prev => ({ ...prev, salary: parseMoneyInput(e.target.value) }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата вступления</label>
                    <input
                      type="date"
                      value={newSalary.effective_date}
                      onChange={e => setNewSalary(prev => ({ ...prev, effective_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Примечание</label>
                  <input
                    value={newSalary.note}
                    onChange={e => setNewSalary(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="Причина изменения"
                  />
                </div>
                <div className="add-salary-actions">
                  <button type="button" className="btn-secondary btn-small" onClick={() => setShowAddSalary(false)}>
                    Отмена
                  </button>
                  <button type="button" className="btn-primary btn-small" onClick={handleAddSalary} disabled={savingSalary}>
                    {savingSalary ? 'Сохранение...' : 'Добавить'}
                  </button>
                </div>
              </div>
            )}

            {loadingHistory ? (
              <div className="salary-history-loading">Загрузка...</div>
            ) : salaryHistory.length === 0 ? (
              <div className="salary-history-empty">Нет записей об изменении оклада</div>
            ) : (
              <div className="emp-history">
                {salaryHistory.map((h, idx) => (
                  <div key={h.id} className={`emp-history-item ${idx === 0 ? 'current' : ''}`}>
                    <div className="emp-history-date">{formatDate(h.effective_date)}</div>
                    <div className="emp-history-desc">
                      <span className="history-salary">{h.salary.toLocaleString('ru-RU')} ₽</span>
                      {h.note && <span className="history-note">{h.note}</span>}
                    </div>
                    <button type="button" className="btn-delete-small" onClick={() => handleDeleteSalary(h.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Действия */}
          <div className="form-actions">
            <button type="button" className="btn-danger" onClick={() => setShowArchiveReasonModal(true)}>
              В архив
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditMode(true)}>
              ✎ Редактировать
            </button>
          </div>

          {showArchiveReasonModal && (
            <div className="modal-overlay modal-overlay-inner" {...archiveOverlayClose}>
              <div className="modal-content archive-reason-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Причина архивации</h3>
                  <button className="modal-close" onClick={closeArchiveReasonModal}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Укажите причину *</label>
                    <textarea
                      className="archive-reason-input"
                      value={archiveReason}
                      onChange={e => setArchiveReason(e.target.value)}
                      placeholder="Например: Уволился или Перевод в отдел РД"
                      rows={4}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={closeArchiveReasonModal}
                      disabled={archiving}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={handleArchive}
                      disabled={archiving || archiveReason.trim().length === 0}
                    >
                      {archiving ? 'Архивируем...' : 'Подтвердить'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
