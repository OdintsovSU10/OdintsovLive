import { useState, useRef } from 'react'
import { useEmployeeImport } from '../hooks/useEmployeeImport'
import './ImportModal.css'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function ImportEmployeesModal({ onClose, onSuccess }: Props) {
  const { loading, preview, parseFile, importEmployees, clearPreview } = useEmployeeImport()
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      await parseFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка парсинга файла')
    }
  }

  const handleImport = async () => {
    const result = await importEmployees(preview)
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

  return (
    <div className="import-overlay" onClick={handleClose}>
      <div className="import-modal import-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="import-header">
          <h3>Импорт сотрудников</h3>
          <button className="import-close" onClick={handleClose}>✕</button>
        </div>

        <div className="import-content">
          {preview.length === 0 ? (
            <>
              <p className="import-desc">
                Загрузите Excel файл со списком сотрудников. Ожидаемая структура:
              </p>
              <div className="import-example-table">
                <table>
                  <thead>
                    <tr>
                      <th>A</th>
                      <th>B</th>
                      <th>C</th>
                      <th>D</th>
                      <th>E</th>
                      <th>F</th>
                      <th>G</th>
                      <th>H</th>
                      <th>I</th>
                      <th>J</th>
                      <th>K</th>
                      <th>L</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="import-example-header">
                      <td>ФИО</td>
                      <td>Должность</td>
                      <td>Отдел</td>
                      <td>Подразделение</td>
                      <td>Дата приёма</td>
                      <td>Дата рождения</td>
                      <td>Оклад</td>
                      <td>Страна</td>
                      <td>СНИЛС</td>
                      <td>Компания</td>
                      <td>Email</td>
                      <td>Телефон</td>
                    </tr>
                    <tr>
                      <td>Иванов И.И.</td>
                      <td>Менеджер</td>
                      <td>Продажи</td>
                      <td>Отдел 1 / Группа А</td>
                      <td>01.01.2024</td>
                      <td>20.05.1990</td>
                      <td>50000</td>
                      <td>Россия</td>
                      <td>123-456-789 00</td>
                      <td>ООО Ромашка</td>
                      <td>ivanov@example.com</td>
                      <td>+7 (999) 123-45-67</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div
                className={`import-dropzone ${dragOver ? 'import-dropzone-active' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0])} />
                <div className="import-icon">📋</div>
                <div className="import-text">Перетащите файл сюда</div>
                <div className="import-subtext">или нажмите для выбора</div>
              </div>
            </>
          ) : (
            <>
              <p className="import-desc">
                Найдено {preview.length} сотрудников. Проверьте данные перед импортом.
              </p>
              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>Должность</th>
                      <th>Отдел</th>
                      <th>ЗП</th>
                      <th>Телефон</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((emp, i) => (
                      <tr key={i}>
                        <td>{emp.full_name}</td>
                        <td>{emp.position}</td>
                        <td>{emp.department || '—'}</td>
                        <td>{emp.salary.toLocaleString('ru-RU')} ₽</td>
                        <td>{emp.phone || '—'}</td>
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td colSpan={5} className="import-more">...и ещё {preview.length - 10} записей</td>
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
              {loading ? 'Импорт...' : `Импортировать ${preview.length} сотр.`}
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
