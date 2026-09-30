import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'

interface Props {
  title: string
  formId: string
  submitLabel: string
  saving: boolean
  onClose: () => void
  onDelete?: () => void
  children: ReactNode
}

// Лист с формой: кнопка «Сохранить» внизу привязана к форме через form=id — Enter тоже отправляет
export function FormSheet({ title, formId, submitLabel, saving, onClose, onDelete, children }: Props) {
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="car-btn danger" onClick={onDelete} disabled={saving}>
              <Trash2 size={18} />
              <span>Удалить</span>
            </button>
          )}
          <button type="submit" form={formId} className="car-btn primary grow" disabled={saving}>
            {saving ? 'Сохраняю…' : submitLabel}
          </button>
        </>
      }
    >
      {children}
    </BottomSheet>
  )
}
