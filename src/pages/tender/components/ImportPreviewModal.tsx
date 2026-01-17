import { X } from 'lucide-react'
import { ImportPreview } from '../types'
import { formatMoney } from '../utils'

interface Props {
  importPreview: ImportPreview[]
  replaceOnImport: boolean
  importing: boolean
  setReplaceOnImport: (v: boolean) => void
  onClose: () => void
  onConfirm: () => void
}

export default function ImportPreviewModal({
  importPreview,
  replaceOnImport,
  importing,
  setReplaceOnImport,
  onClose,
  onConfirm
}: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Предпросмотр импорта ({importPreview.length} сотр.)</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="import-preview-table">
            <div className="preview-header">
              <span>ФИО</span>
              <span>Должность</span>
              <span>Трудоустройство</span>
              <span>Дата рождения</span>
              <span>Оклад</span>
              <span>Группа</span>
            </div>
            {importPreview.map((item, i) => (
              <div key={i} className="preview-row">
                <span>{item.full_name}</span>
                <span>{item.position}</span>
                <span>{item.hire_date ? new Date(item.hire_date).toLocaleDateString('ru-RU') : '—'}</span>
                <span>{item.birth_date ? new Date(item.birth_date).toLocaleDateString('ru-RU') : '—'}</span>
                <span>{formatMoney(item.salary)}</span>
                <span>{item.group_name || '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <label className="replace-toggle">
            <input
              type="checkbox"
              checked={replaceOnImport}
              onChange={e => setReplaceOnImport(e.target.checked)}
            />
            <span>Заменить существующих</span>
          </label>
          <button className="btn-cancel" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-save" onClick={onConfirm} disabled={importing}>
            {importing ? 'Импорт...' : `Импортировать (${importPreview.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
