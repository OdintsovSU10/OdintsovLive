import { useState, type FormEvent } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import type { NewEmployee } from '../types'
import { formatMoneyInput, getTodayIsoDate, parseMoneyInput } from '../utils/adminTenderHelpers'
import './AdminSheets.css'

const FORM_ID = 'tender-add-employee-form'

type NamePart = 'last_name' | 'first_name' | 'middle_name'

export function AddEmployeeModal({ onClose, onSave, subdivisions }: {
  onClose: () => void
  onSave: (emp: NewEmployee) => void | Promise<unknown>
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
    hire_date: getTodayIsoDate(),
    company: ''
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (field: keyof NewEmployee, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ФИО собирается из трёх частей
  const handleNamePart = (field: NamePart, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      return { ...next, full_name: [next.last_name, next.first_name, next.middle_name].filter(Boolean).join(' ') }
    })
  }

  const canSubmit = form.full_name.trim().length > 0 && form.position.trim().length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      title="Добавить сотрудника"
      onClose={onClose}
      footer={
        <button type="submit" form={FORM_ID} className="tsh-btn primary grow" disabled={saving || !canSubmit}>
          {saving ? 'Сохраняю…' : 'Добавить'}
        </button>
      }
    >
      <form id={FORM_ID} className="tsh-form" onSubmit={handleSubmit}>
        <label className="tsh-form-field">
          <span>Фамилия *</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={form.last_name}
            onChange={e => handleNamePart('last_name', e.target.value)}
            onClear={() => handleNamePart('last_name', '')}
            clearLabel="Очистить фамилию"
            autoComplete="off"
          />
        </label>
        <label className="tsh-form-field">
          <span>Имя *</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={form.first_name}
            onChange={e => handleNamePart('first_name', e.target.value)}
            onClear={() => handleNamePart('first_name', '')}
            clearLabel="Очистить имя"
            autoComplete="off"
          />
        </label>
        <label className="tsh-form-field">
          <span>Отчество</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={form.middle_name}
            onChange={e => handleNamePart('middle_name', e.target.value)}
            onClear={() => handleNamePart('middle_name', '')}
            clearLabel="Очистить отчество"
            autoComplete="off"
          />
        </label>
        <label className="tsh-form-field">
          <span>Дата приёма</span>
          <input
            className="tsh-control"
            type="date"
            value={form.hire_date}
            onChange={e => handleChange('hire_date', e.target.value)}
          />
        </label>
        <label className="tsh-form-field">
          <span>Должность *</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={form.position}
            onChange={e => handleChange('position', e.target.value)}
            onClear={() => handleChange('position', '')}
            clearLabel="Очистить должность"
            autoComplete="off"
          />
        </label>
        <label className="tsh-form-field">
          <span>Отдел</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={form.department}
            onChange={e => handleChange('department', e.target.value)}
            onClear={() => handleChange('department', '')}
            clearLabel="Очистить отдел"
            autoComplete="off"
          />
        </label>
        <label className="tsh-form-field">
          <span>Подразделение</span>
          <select
            className="tsh-control"
            value={form.subdivision}
            onChange={e => handleChange('subdivision', e.target.value)}
          >
            <option value="">— Без подразделения —</option>
            {subdivisions.map(subdivision => (
              <option key={subdivision} value={subdivision}>
                {subdivision}
              </option>
            ))}
          </select>
        </label>
        <label className="tsh-form-field">
          <span>Оклад</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            type="text"
            inputMode="numeric"
            value={formatMoneyInput(form.current_salary)}
            onChange={e => handleChange('current_salary', parseMoneyInput(e.target.value))}
            onClear={() => handleChange('current_salary', 0)}
            clearLabel="Очистить оклад"
            placeholder="0"
          />
        </label>
        <label className="tsh-form-field">
          <span>Ежемес. бонус</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            type="text"
            inputMode="numeric"
            value={formatMoneyInput(form.monthly_bonus)}
            onChange={e => handleChange('monthly_bonus', parseMoneyInput(e.target.value))}
            onClear={() => handleChange('monthly_bonus', 0)}
            clearLabel="Очистить бонус"
            placeholder="0"
          />
        </label>
        <label className="tsh-form-field">
          <span>Компания</span>
          <ClearableInput
            wrapperClassName="tsh-field"
            value={form.company}
            onChange={e => handleChange('company', e.target.value)}
            onClear={() => handleChange('company', '')}
            clearLabel="Очистить компанию"
            autoComplete="off"
          />
        </label>
      </form>
    </BottomSheet>
  )
}
