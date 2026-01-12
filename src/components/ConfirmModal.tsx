import { AlertTriangle } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  subtitle,
  description = 'Это действие нельзя отменить',
  confirmText = 'Удалить',
  cancelText = 'Отмена',
  onConfirm,
  onCancel
}: Props) {
  return (
    <div className="modal-overlay confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon">
          <AlertTriangle size={32} />
        </div>
        <h3>{title}</h3>
        {subtitle && <p className="confirm-note-title">{subtitle}</p>}
        <p className="confirm-text">{description}</p>
        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button className="confirm-btn-delete" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
