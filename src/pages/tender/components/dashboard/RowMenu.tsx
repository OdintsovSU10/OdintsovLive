import { useEffect, useRef, useState, type FC } from 'react'
import { MoreHorizontal } from 'lucide-react'

interface IRowMenuProps {
  name: string
  archiving: boolean
  onEdit: () => void
  onArchive: () => void
}

// Две строки меню по 44px и отступы
const MENU_HEIGHT = 100

// Меню «⋯» строки сотрудника: изменить / в архив
export const RowMenu: FC<IRowMenuProps> = ({ name, archiving, onEdit, onArchive }) => {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleToggle = () => {
    if (!open && rootRef.current) {
      // Меню открывается вверх, если внизу списка или экрана не хватает места
      const list = rootRef.current.closest('.dash-people-list')
      const limit = Math.min(list ? list.getBoundingClientRect().bottom : window.innerHeight, window.innerHeight)
      setOpenUp(rootRef.current.getBoundingClientRect().bottom + MENU_HEIGHT > limit)
    }
    setOpen(value => !value)
  }

  const handleItem = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <span ref={rootRef} className="dash-menu" onClick={event => event.stopPropagation()}>
      <button
        type="button"
        className="dash-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Действия: ${name}`}
        title="Действия"
        onClick={handleToggle}
      >
        <span className="dash-menu-face"><MoreHorizontal size={16} strokeWidth={1.5} /></span>
      </button>
      {open && (
        <div className={`dash-menu-list${openUp ? ' is-up' : ''}`} role="menu">
          <button type="button" role="menuitem" className="dash-menu-item" onClick={() => handleItem(onEdit)}>
            Изменить
          </button>
          <button
            type="button"
            role="menuitem"
            className="dash-menu-item danger"
            disabled={archiving}
            onClick={() => handleItem(onArchive)}
          >
            В архив
          </button>
        </div>
      )}
    </span>
  )
}
