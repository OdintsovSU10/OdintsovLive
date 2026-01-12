import { useRef, useState } from 'react'
import { Pin, Trash2 } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
}

interface Props {
  note: Note
  preview: string
  onOpen: () => void
  onDelete: (e?: React.MouseEvent) => void
  onPin: (e?: React.MouseEvent) => void
}

export default function NoteCard({ note, preview, onOpen, onDelete, onPin }: Props) {
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartX = useRef(0)
  const touchCurrentX = useRef(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX
    const diff = touchCurrentX.current - touchStartX.current
    if (Math.abs(diff) > 50) {
      setSwipeDirection(diff > 0 ? 'right' : 'left')
    } else {
      setSwipeDirection(null)
    }
  }

  const handleTouchEnd = () => {
    const diff = touchCurrentX.current - touchStartX.current
    if (diff > 80) {
      onPin()
    } else if (diff < -80) {
      onDelete()
    }
    setIsSwiping(false)
    setSwipeDirection(null)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="note-card-wrapper">
      <div className={`swipe-action swipe-pin ${isSwiping && swipeDirection === 'right' ? 'visible' : ''}`}>
        <Pin size={20} />
        <span>{note.is_pinned ? 'Открепить' : 'Закрепить'}</span>
      </div>
      <div className={`swipe-action swipe-delete ${isSwiping && swipeDirection === 'left' ? 'visible' : ''}`}>
        <Trash2 size={20} />
        <span>Удалить</span>
      </div>
      <div
        className={`note-card ${note.is_pinned ? 'pinned' : ''} ${isSwiping ? `swiping-${swipeDirection || ''}` : ''}`}
        onClick={onOpen}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="note-card-header">
          <div className="note-card-text">
            <h3>{note.title}</h3>
            {preview && <p className="note-preview">{preview}</p>}
          </div>
          <div className="note-card-actions">
            <button
              className={`pin-btn ${note.is_pinned ? 'active' : ''}`}
              onClick={onPin}
              title={note.is_pinned ? 'Открепить' : 'Закрепить'}
            >
              <Pin size={16} />
            </button>
            <button className="delete-btn" onClick={onDelete} title="Удалить">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <span className="note-date">{formatDate(note.created_at)}</span>
      </div>
    </div>
  )
}
