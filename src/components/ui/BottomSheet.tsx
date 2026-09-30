import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import './BottomSheet.css'

const CLOSE_MS = 180
const DESKTOP_QUERY = '(min-width: 768px)'
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

// Телефон — лист снизу, от 768px — панель справа. Esc, подложка и × закрывают.
export function BottomSheet({ title, onClose, children, footer }: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [closing, setClosing] = useState(false)

  const requestClose = useCallback(() => {
    if (closing) return
    if (reduced) {
      onClose()
      return
    }
    setClosing(true)
    window.setTimeout(onClose, CLOSE_MS)
  }, [closing, reduced, onClose])

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // На телефоне не поднимаем клавиатуру сразу — фокус на самом листе
    const panel = panelRef.current
    const firstField = panel?.querySelector<HTMLElement>('input, select, textarea')
    if (window.matchMedia(DESKTOP_QUERY).matches && firstField) {
      firstField.focus()
    } else {
      panel?.focus()
    }

    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      requestClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    // Фокус не уходит за пределы листа
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className={`ui-sheet-root ${closing ? 'closing' : ''}`} onKeyDown={handleKeyDown}>
      <div className="ui-sheet-backdrop" onClick={requestClose} />
      <div
        ref={panelRef}
        className="ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ui-sheet-handle" aria-hidden="true" />
        <header className="ui-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ui-sheet-close" onClick={requestClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="ui-sheet-body">{children}</div>
        {footer && <footer className="ui-sheet-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}
