import { useState, useRef } from 'react'
import { useTimesheetImport } from '../hooks/useTimesheetImport'
import type { Employee } from '../types'
import './ImportModal.css'

interface Props {
  employees: Employee[]
  onClose: () => void
  onSuccess: () => void
}

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

export function ImportTimesheetModal({ employees, onClose, onSuccess }: Props) {
  const { loading, preview, period, parseFile, importTimesheet, clearPreview } = useTimesheetImport()
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      await parseFile(file, employees)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка парсинга файла')
    }
  }

  const handleImport = async () => {
    const result = await importTimesheet(preview)
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

  const matchedCount = preview.filter(p => p.matched_employee_id).length
  const unmatchedCount = preview.length - matchedCount

  return (
    <div className="import-overlay" onClick={handleClose}>
      <div className="import-modal import-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="import-header">
          <h3>Импорт табеля</h3>
          <button className="import-close" onClick={handleClose}>✕</button>
        </div>

        <div className="import-content">
          {preview.length === 0 ? (
            <>
              <p className="import-desc">
                Загрузите Excel файл с табелем. Ожидаемая структура (данные с 4-й строки):
              </p>
              <div className="import-example-table">
                <table>
                  <thead>
                    <tr>
                      <th>A</th>
                      <th>B</th>
                      <th>...</th>
                      <th>N</th>
                      <th>O</th>
                      <th>P</th>
                      <th>...</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="import-example-header">
                      <td>ФИО</td>
                      <td>Период</td>
                      <td>...</td>
                      <td>1</td>
                      <td>2</td>
                      <td>3</td>
                      <td>...</td>
                    </tr>
                    <tr>
                      <td>Иванов И.И.</td>
                      <td>01/2024</td>
                      <td>...</td>
                      <td>8</td>
                      <td>8</td>
                      <td>В</td>
                      <td>...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="import-hint">8 = работа, У = удалёнка, О = отпуск, Б = больничный, В = выходной</p>
              <div
                className={`import-dropzone ${dragOver ? 'import-dropzone-active' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0])} />
                <div className="import-icon">📅</div>
                <div className="import-text">Перетащите файл сюда</div>
                <div className="import-subtext">или нажмите для выбора</div>
              </div>
            </>
          ) : (
            <>
              {period && (
                <div className="import-period">
                  Период: <strong>{monthNames[period.month - 1]} {period.year}</strong>
                </div>
              )}
              <p className="import-desc">
                Найдено {preview.length} записей.
                <span className="import-matched"> Сопоставлено: {matchedCount}</span>
                {unmatchedCount > 0 && <span className="import-unmatched"> Не найдено: {unmatchedCount}</span>}
              </p>
              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>ФИО в табеле</th>
                      <th>Сопоставлен</th>
                      <th>Раб. дней</th>
                      <th>Удал.</th>
                      <th>Отп.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 15).map((row, i) => {
                      const workDays = row.days.filter(d => d.status === 'work').length
                      const remoteDays = row.days.filter(d => d.status === 'remote').length
                      const vacationDays = row.days.filter(d => d.status === 'vacation').length

                      return (
                        <tr key={i} className={row.matched_employee_id ? '' : 'import-row-unmatched'}>
                          <td>{row.employee_name}</td>
                          <td>
                            {row.matched_employee_name ? (
                              <span className="import-match-ok">{row.matched_employee_name}</span>
                            ) : (
                              <span className="import-match-fail">Не найден</span>
                            )}
                          </td>
                          <td>{workDays}</td>
                          <td>{remoteDays}</td>
                          <td>{vacationDays}</td>
                        </tr>
                      )
                    })}
                    {preview.length > 15 && (
                      <tr>
                        <td colSpan={5} className="import-more">...и ещё {preview.length - 15} записей</td>
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
          <button className="import-btn-primary" onClick={handleImport} disabled={loading || matchedCount === 0}>
            {loading ? 'Импорт...' : `Импортировать ${matchedCount} записей`}
          </button>
          <button className="import-btn-secondary" onClick={handleClose} disabled={loading}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
