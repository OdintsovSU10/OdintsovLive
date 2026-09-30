import { AlertTriangle } from 'lucide-react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'

interface Props {
  title: string
  text: string
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmSheet({ title, text, confirmLabel, busy, onConfirm, onClose }: Props) {
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="car-btn ghost grow" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="button" className="car-btn danger-solid grow" onClick={onConfirm} disabled={busy}>
            {busy ? 'Удаляю…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="car-confirm">
        <AlertTriangle size={32} aria-hidden="true" />
        <p>{text}</p>
      </div>
    </BottomSheet>
  )
}
