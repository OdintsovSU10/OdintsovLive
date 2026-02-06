import { useState, useRef } from 'react'
import { useSalaryHistoryImport } from '../hooks/useSalaryHistoryImport'
import './ImportModal.css'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function ImportSalaryHistoryModal({ onClose, onSuccess }: Props) {
  const { loading, preview, parseFile, importSalaryHistory, clearPreview } = useSalaryHistoryImport()
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
    const result = await importSalaryHistory(preview)
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

  const formatDate = (iso: string) => {
    const [year, month] = iso.split('-')
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
    return `${months[parseInt(month, 10) - 1]} ${year}`
  }

  return (
    <div className="import-overlay" onClick={handleClose}>
      <div className="import-modal import-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="import-header">
          <h3>Импорт истории окладов</h3>
          <button className="import-close" onClick={handleClose}>✕</button>
        </div>

        <div className="import-content">
          {preview.length === 0 ? (
            <>
              <p className="import-desc">
                Загрузите Excel файл с историей изменений окладов. Ожидаемая структура:
              </p>
              <div className="import-example-table">
                <table>
                  <thead>
                    <tr>
                      <th>A</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Артамонов М.А.</td>
                    </tr>
                    <tr>
                      <td>Текущий оклад с: Август 2025 = 175 000,00</td>
                    </tr>
                    <tr>
                      <td>изменение оклада с: Июль 2025 = 150 000,00</td>
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
                <div className="import-icon">📊</div>
                <div className="import-text">Перетащите файл сюда</div>
                <div className="import-subtext">или нажмите для выбора</div>
              </div>
            </>
          ) : (
            <>
              <p className="import-desc">
                Найдено {preview.length} записей об окладах. Проверьте данные перед импортом.
              </p>
              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Дата</th>
                      <th>Оклад</th>
                      <th>Тип</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 15).map((entry, i) => (
                      <tr key={i}>
                        <td>{entry.employee_name}</td>
                        <td>{formatDate(entry.effective_date)}</td>
                        <td>{entry.salary.toLocaleString('ru-RU')} ₽</td>
                        <td>{entry.note}</td>
                      </tr>
                    ))}
                    {preview.length > 15 && (
                      <tr>
                        <td colSpan={4} className="import-more">...и ещё {preview.length - 15} записей</td>
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
              {loading ? 'Импорт...' : `Импортировать ${preview.length} записей`}
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
