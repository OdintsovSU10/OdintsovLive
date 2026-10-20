import { useState } from 'react'
import { useOverlayClose } from '../../../hooks/useOverlayClose'
import type { NewEmployee } from '../types'
import { formatMoneyInput, parseMoneyInput } from '../utils/adminTenderHelpers'
import '../TenderPage.css'
import '../AdminTenderPanel.css'

export function AddEmployeeModal({ onClose, onSave, subdivisions }: {
  onClose: () => void
  onSave: (emp: NewEmployee) => void
  subdivisions: string[]
}) {
  const [form, setForm] = useState<NewEmployee>({
    full_name: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    position: '',
    department: '',
    subdivision: '',
    current_salary: 0,
    monthly_bonus: 0,
    hire_date: new Date().toISOString().split('T')[0],
    company: ''
  })
  const [saving, setSaving] = useState(false)
  const overlayClose = useOverlayClose(onClose)

  const handleChange = (field: keyof NewEmployee, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const updateFullName = (lastName: string, firstName: string, middleName: string) => {
    const parts = [lastName, firstName, middleName].filter(Boolean)
    setForm(prev => ({ ...prev, full_name: parts.join(' ') }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.position.trim()) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" {...overlayClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Добавить сотрудника</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="edit-form-grid">
            <div className="form-group">
              <label>Фамилия *</label>
              <input value={form.last_name} onChange={e => { handleChange('last_name', e.target.value); updateFullName(e.target.value, form.first_name, form.middle_name) }} />
            </div>
            <div className="form-group">
              <label>Имя *</label>
              <input value={form.first_name} onChange={e => { handleChange('first_name', e.target.value); updateFullName(form.last_name, e.target.value, form.middle_name) }} />
            </div>
            <div className="form-group">
              <label>Отчество</label>
              <input value={form.middle_name} onChange={e => { handleChange('middle_name', e.target.value); updateFullName(form.last_name, form.first_name, e.target.value) }} />
            </div>
            <div className="form-group">
              <label>Дата приёма</label>
              <input type="date" value={form.hire_date} onChange={e => handleChange('hire_date', e.target.value)} />
            </div>
            <div className="form-group form-group-full">
              <label>Должность *</label>
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
                {subdivisions.map(subdivision => (
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
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.full_name.trim() || !form.position.trim()}>
              {saving ? 'Сохранение...' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

