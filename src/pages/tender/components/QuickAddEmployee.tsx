import { useRef, useState, type FormEvent } from 'react'
import { ClearableInput } from '../../../components/ui/ClearableInput'
import type { NewEmployee } from '../types'

interface Props {
  subdivisions: string[]
  existingNames: string[]
  onAdd: (emp: NewEmployee) => Promise<boolean>
  onDuplicate: () => void
}

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')

const getLocalIsoDate = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function QuickAddEmployee({ subdivisions, existingNames, onAdd, onDuplicate }: Props) {
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [subdivision, setSubdivision] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const canSubmit = !saving && normalizeName(fullName).length > 0 && position.trim().length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const name = normalizeName(fullName)
    if (existingNames.some(existing => normalizeName(existing).toLowerCase() === name.toLowerCase())) {
      onDuplicate()
      return
    }

    const [lastName = '', firstName = '', ...middle] = name.split(' ')
    setSaving(true)
    try {
      const added = await onAdd({
        full_name: name,
        last_name: lastName,
        first_name: firstName,
        middle_name: middle.join(' '),
        position: position.trim(),
        department: '',
        subdivision,
        current_salary: 0,
        monthly_bonus: 0,
        hire_date: getLocalIsoDate(),
        company: ''
      })
      if (added) {
        setFullName('')
        setPosition('')
      }
    } finally {
      setSaving(false)
      nameRef.current?.focus()
    }
  }

  return (
    <form className="quick-add-row" onSubmit={handleSubmit}>
      <ClearableInput
        ref={nameRef}
        wrapperClassName="quick-add-name"
        value={fullName}
        onChange={e => setFullName(e.target.value)}
        onClear={() => setFullName('')}
        clearLabel="Очистить ФИО"
        placeholder="Фамилия Имя Отчество"
        aria-label="ФИО нового сотрудника"
        autoComplete="off"
      />
      <ClearableInput
        wrapperClassName="quick-add-position"
        value={position}
        onChange={e => setPosition(e.target.value)}
        onClear={() => setPosition('')}
        clearLabel="Очистить должность"
        placeholder="Должность"
        aria-label="Должность нового сотрудника"
        autoComplete="off"
      />
      <select
        className="quick-add-subdivision"
        value={subdivision}
        onChange={e => setSubdivision(e.target.value)}
        aria-label="Подразделение нового сотрудника"
      >
        <option value="">— Без подразделения —</option>
        {subdivisions.map(item => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <button type="submit" className="btn-primary quick-add-submit" disabled={!canSubmit}>
        {saving ? 'Добавляем…' : '+ Добавить'}
      </button>
    </form>
  )
}
