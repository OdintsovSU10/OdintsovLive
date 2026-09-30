import { createPortal } from 'react-dom'
import type { ToastData } from '../../hooks/useToast'
import './Toast.css'

interface Props {
  toast: ToastData | null
  onClose: () => void
}

export function Toast({ toast, onClose }: Props) {
  if (!toast) return null

  const handleAction = () => {
    toast.onAction?.()
    onClose()
  }

  return createPortal(
    <div key={toast.id} className={`ui-toast ${toast.tone}`} role="status" aria-live="polite">
      <span className="ui-toast-message">{toast.message}</span>
      {toast.actionLabel && (
        <button type="button" className="ui-toast-action" onClick={handleAction}>
          {toast.actionLabel}
        </button>
      )}
      <span className="ui-toast-timer" style={{ animationDuration: `${toast.duration}ms` }} />
    </div>,
    document.body
  )
}
