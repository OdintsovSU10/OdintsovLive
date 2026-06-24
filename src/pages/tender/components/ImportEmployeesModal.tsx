import { useEffect, useState } from 'react'
import {
  DEFAULT_EMPLOYEE_IMPORT_OPTIONS,
  useEmployeeImport
} from '../hooks/useEmployeeImport'
import { fetchFotApiDepartments } from '../utils/fotApi'
import type { EmployeeImportOptions, FotApiDepartment, FotApiLoadOptions } from '../types'
import './ImportModal.css'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const FOT_MAX_RECORD_OPTIONS = [100, 500, 1000, 3000, 5000, 10000]

const FOT_FIELD_OPTIONS: Array<{
  key: keyof Pick<EmployeeImportOptions, 'work' | 'employment' | 'salary' | 'contacts' | 'documents'>
  label: string
}> = [
  { key: 'work', label: 'Должности и отделы' },
  { key: 'employment', label: 'Даты приёма и рождения' },
  { key: 'salary', label: 'Оклады' },
  { key: 'contacts', label: 'Контакты' },
  { key: 'documents', label: 'Документы и организация' }
]

export function ImportEmployeesModal({ onClose, onSuccess }: Props) {
  const { loading, preview, loadFromFotApi, importEmployees, clearPreview } = useEmployeeImport()
  const [error, setError] = useState<string | null>(null)
  const [departments, setDepartments] = useState<FotApiDepartment[]>([])
  const [departmentsLoading, setDepartmentsLoading] = useState(false)
  const [departmentsError, setDepartmentsError] = useState<string | null>(null)
  const [fotLoadOptions, setFotLoadOptions] = useState<FotApiLoadOptions>({
    activeOnly: true,
    departmentId: '',
    maxRecords: 1000
  })
  const [fotImportOptions, setFotImportOptions] = useState<EmployeeImportOptions>(DEFAULT_EMPLOYEE_IMPORT_OPTIONS)

  const activeImportOptions = fotImportOptions
  const previewColumnCount = [
    true,
    activeImportOptions.work,
    activeImportOptions.work,
    activeImportOptions.employment,
    activeImportOptions.salary,
    activeImportOptions.contacts,
    activeImportOptions.contacts,
    activeImportOptions.documents
  ].filter(Boolean).length

  useEffect(() => {
    let cancelled = false

    async function loadDepartments() {
      setDepartmentsLoading(true)
      setDepartmentsError(null)

      try {
        const items = await fetchFotApiDepartments()
        if (!cancelled) {
          setDepartments(items)
          if (items.length === 0) {
            setDepartmentsError('FOT API не вернул отделы')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setDepartmentsError(err instanceof Error ? err.message : 'Не удалось загрузить отделы FOT API')
        }
      } finally {
        if (!cancelled) {
          setDepartmentsLoading(false)
        }
      }
    }

    loadDepartments()

    return () => {
      cancelled = true
    }
  }, [])

  const handleFotApiLoad = async () => {
    setError(null)
    try {
      await loadFromFotApi(fotLoadOptions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки FOT API')
    }
  }

  const handleImport = async () => {
    const result = await importEmployees(preview, activeImportOptions)
    if (result.success) {
      onSuccess()
      onClose()
    } else {
      setError(`Импортировано ${result.records_success} из ${result.records_total}. Ошибки: ${result.errors.slice(0, 3).join('; ')}`)
    }
  }

  const handleClose = () => {
    clearPreview()
    onClose()
  }

  const handleFotFieldToggle = (
    key: keyof Pick<EmployeeImportOptions, 'work' | 'employment' | 'salary' | 'contacts' | 'documents'>
  ) => {
    setFotImportOptions(current => ({
      ...current,
      [key]: !current[key]
    }))
  }

  const selectedDepartment = departments.find(department => department.id === fotLoadOptions.departmentId)

  return (
    <div className="import-overlay" onClick={handleClose}>
      <div className="import-modal import-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="import-header">
          <h3>Синхронизация сотрудников FOT</h3>
          <button className="import-close" onClick={handleClose}>✕</button>
        </div>

        <div className="import-content">
          {preview.length === 0 ? (
            <>
              <div className="fot-import-panel">
                <div className="fot-import-title-row">
                  <h4>FOT API</h4>
                  <span>employees</span>
                </div>

                <div className="fot-import-controls">
                  <label className="fot-control">
                    <span>Максимум</span>
                    <select
                      value={fotLoadOptions.maxRecords}
                      onChange={event => setFotLoadOptions(current => ({
                        ...current,
                        maxRecords: Number(event.target.value)
                      }))}
                    >
                      {FOT_MAX_RECORD_OPTIONS.map(option => (
                        <option key={option} value={option}>{option.toLocaleString('ru-RU')}</option>
                      ))}
                    </select>
                  </label>

                  <label className="fot-control fot-control-wide">
                    <span>Отдел FOT</span>
                    <select
                      value={fotLoadOptions.departmentId}
                      disabled={departmentsLoading}
                      onChange={event => setFotLoadOptions(current => ({
                        ...current,
                        departmentId: event.target.value
                      }))}
                    >
                      <option value="">
                        {departmentsLoading ? 'Загрузка отделов...' : 'Все отделы'}
                      </option>
                      {departments.map(department => (
                        <option key={department.id} value={department.id}>
                          {department.name} · {department.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="fot-department-meta">
                  {departmentsError ? (
                    <span className="fot-inline-note error">{departmentsError}</span>
                  ) : (
                    <span className="fot-inline-note">
                      {selectedDepartment
                        ? `Выбран: ${selectedDepartment.name}`
                        : `Доступно отделов: ${departments.length}`}
                    </span>
                  )}
                </div>

                <div className="fot-import-options">
                  <span className="fot-import-options-title">Загружать в портал</span>
                  <div className="fot-import-option-grid">
                    <label className="fot-check">
                      <input type="checkbox" checked disabled />
                      <span>ФИО</span>
                    </label>
                    {FOT_FIELD_OPTIONS.map(option => (
                      <label key={option.key} className="fot-check">
                        <input
                          type="checkbox"
                          checked={fotImportOptions[option.key]}
                          onChange={() => handleFotFieldToggle(option.key)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button className="import-btn-primary" onClick={handleFotApiLoad} disabled={loading}>
                  {loading ? 'Загрузка...' : 'Загрузить из FOT API'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="import-desc">
                Найдено {preview.length} сотрудников из FOT API. Проверьте данные перед синхронизацией.
              </p>
              <div className="fot-selected-summary">
                <span>Будет синхронизировано:</span>
                <strong>
                  ФИО
                  {activeImportOptions.work ? ', должности/отделы' : ''}
                  {activeImportOptions.employment ? ', даты' : ''}
                  {activeImportOptions.salary ? ', оклады' : ''}
                  {activeImportOptions.contacts ? ', контакты' : ''}
                  {activeImportOptions.documents ? ', документы/организация' : ''}
                </strong>
              </div>
              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      {activeImportOptions.work && <th>Должность</th>}
                      {activeImportOptions.work && <th>Отдел</th>}
                      {activeImportOptions.employment && <th>Дата приёма</th>}
                      {activeImportOptions.salary && <th>ЗП</th>}
                      {activeImportOptions.contacts && <th>Телефон</th>}
                      {activeImportOptions.contacts && <th>Email</th>}
                      {activeImportOptions.documents && <th>Организация</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((emp, i) => (
                      <tr key={i}>
                        <td>{emp.full_name}</td>
                        {activeImportOptions.work && <td>{emp.position || '—'}</td>}
                        {activeImportOptions.work && <td>{emp.department || '—'}</td>}
                        {activeImportOptions.employment && <td>{emp.hire_date || '—'}</td>}
                        {activeImportOptions.salary && <td>{emp.salary > 0 ? `${emp.salary.toLocaleString('ru-RU')} ₽` : '—'}</td>}
                        {activeImportOptions.contacts && <td>{emp.phone || '—'}</td>}
                        {activeImportOptions.contacts && <td>{emp.email || '—'}</td>}
                        {activeImportOptions.documents && <td>{emp.company || emp.country || '—'}</td>}
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td colSpan={previewColumnCount} className="import-more">...и ещё {preview.length - 10} записей</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && <div className="import-error">{error}</div>}
        </div>

        <div className="import-actions">
          {preview.length > 0 && (
            <button className="import-btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? 'Синхронизация...' : `Синхронизировать ${preview.length} сотр.`}
            </button>
          )}
          <button className="import-btn-secondary" onClick={handleClose} disabled={loading}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
