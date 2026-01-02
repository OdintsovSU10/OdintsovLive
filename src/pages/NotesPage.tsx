import { useState, useEffect, useRef, TouchEvent } from 'react'
import { Plus, X, Pin, Trash2, Bold, Italic, Underline, Strikethrough, Type, Pencil, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './NotesPage.css'

interface Note {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [swipedNoteId, setSwipedNoteId] = useState<string | null>(null)
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ noteId: string; title: string } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchCurrentX = useRef(0)

  const extractTitle = (html: string) => {
    const div = document.createElement('div')
    div.innerHTML = html

    let firstLine = ''

    // Check if content starts with block elements (div/p)
    const firstBlockEl = div.querySelector('div, p')
    if (firstBlockEl && firstBlockEl.parentElement === div) {
      // Check if there's text before the first block element
      let textBefore = ''
      for (const node of Array.from(div.childNodes)) {
        if (node === firstBlockEl) break
        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
          textBefore += node.textContent || ''
        }
      }
      textBefore = textBefore.trim()
      if (textBefore) {
        firstLine = textBefore
      } else {
        firstLine = (firstBlockEl.textContent || '').trim()
      }
    } else {
      // No block elements, check for BR
      const brEl = div.querySelector('br')
      if (brEl) {
        let textBefore = ''
        for (const node of Array.from(div.childNodes)) {
          if (node === brEl) break
          textBefore += node.textContent || ''
        }
        firstLine = textBefore.trim()
      } else {
        // Just take all text
        firstLine = (div.textContent || '').trim()
      }
    }

    const words = firstLine.split(/\s+/).filter(w => w)
    if (words.length <= 5 && firstLine) {
      return firstLine
    }
    return words.slice(0, 5).join(' ') || 'Без названия'
  }

  const getPreview = (html: string, title: string) => {
    const div = document.createElement('div')
    div.innerHTML = html
    const text = (div.textContent || '').trim()
    const rest = text.startsWith(title) ? text.slice(title.length).trim() : text
    return rest.length > 100 ? rest.slice(0, 100) + '...' : rest
  }

  const getContentWithoutTitle = (html: string, title: string) => {
    const div = document.createElement('div')
    div.innerHTML = html

    // Get text content before first block element
    const firstBlockEl = div.querySelector('div, p')

    if (firstBlockEl && firstBlockEl.parentElement === div) {
      // Collect nodes before first block
      const nodesBefore: Node[] = []
      for (const node of Array.from(div.childNodes)) {
        if (node === firstBlockEl) break
        nodesBefore.push(node)
      }

      const textBefore = nodesBefore.map(n => n.textContent || '').join('').trim()

      if (textBefore === title) {
        // Remove all nodes before block
        nodesBefore.forEach(n => n.parentNode?.removeChild(n))
      } else if (textBefore && !textBefore.includes(title)) {
        // Title is in the first block element
        if (firstBlockEl.textContent?.trim() === title) {
          firstBlockEl.remove()
        }
      }
    } else {
      // No block elements - check first line
      const brEl = div.querySelector('br')
      if (brEl) {
        const nodesBefore: Node[] = []
        for (const node of Array.from(div.childNodes)) {
          if (node === brEl) break
          nodesBefore.push(node)
        }
        const textBefore = nodesBefore.map(n => n.textContent || '').join('').trim()
        if (textBefore === title) {
          nodesBefore.forEach(n => n.parentNode?.removeChild(n))
          brEl.remove()
        }
      }
    }

    return div.innerHTML
  }

  useEffect(() => {
    loadNotes()
  }, [])

  const loadNotes = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) setNotes(data)
    setLoading(false)
  }

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  const handleSave = async () => {
    const content = editorRef.current?.innerHTML || ''
    if (!content.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const title = extractTitle(content)

    if (editingNote) {
      await supabase.from('notes').update({
        title,
        content,
        updated_at: new Date().toISOString()
      }).eq('id', editingNote.id)
    } else {
      await supabase.from('notes').insert({
        user_id: user.id,
        title,
        content
      })
    }

    closeEditor()
    loadNotes()
  }

  const closeEditor = () => {
    if (editorRef.current) editorRef.current.innerHTML = ''
    setShowEditor(false)
    setEditingNote(null)
  }

  const startEdit = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingNote(note)
    setShowEditor(true)
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = note.content
    }, 0)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const note = notes.find(n => n.id === id)
    setConfirmModal({ noteId: id, title: note?.title || 'эту заметку' })
  }

  const confirmDelete = async () => {
    if (!confirmModal) return
    await supabase.from('notes').delete().eq('id', confirmModal.noteId)
    loadNotes()
    if (selectedNote?.id === confirmModal.noteId) setSelectedNote(null)
    setConfirmModal(null)
  }

  const handlePin = async (id: string, isPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    await supabase.from('notes').update({ is_pinned: !isPinned }).eq('id', id)
    loadNotes()
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

  const handleTouchStart = (e: TouchEvent, noteId: string) => {
    touchStartX.current = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
    setSwipedNoteId(noteId)
  }

  const handleTouchMove = (e: TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX
    const diff = touchCurrentX.current - touchStartX.current
    if (Math.abs(diff) > 50) {
      setSwipeDirection(diff > 0 ? 'right' : 'left')
    } else {
      setSwipeDirection(null)
    }
  }

  const handleTouchEnd = async (noteId: string, isPinned: boolean) => {
    const diff = touchCurrentX.current - touchStartX.current
    if (diff > 80) {
      // Swipe right - pin/unpin
      await supabase.from('notes').update({ is_pinned: !isPinned }).eq('id', noteId)
      loadNotes()
    } else if (diff < -80) {
      // Swipe left - delete
      const note = notes.find(n => n.id === noteId)
      setConfirmModal({ noteId, title: note?.title || 'эту заметку' })
    }
    setSwipedNoteId(null)
    setSwipeDirection(null)
  }

  if (loading) {
    return <div className="notes-page"><div className="loading">Загрузка...</div></div>
  }

  return (
    <div className="notes-page">
      <div className="notes-header">
        <h1>Заметки</h1>
        <button className="add-note-btn" onClick={() => setShowEditor(true)}>
          <Plus size={20} />
          <span>Новая заметка</span>
        </button>
      </div>

      {showEditor && (
        <div className="note-editor">
          <div className="editor-toolbar">
            <button onClick={() => execCommand('bold')} title="Жирный">
              <Bold size={18} />
            </button>
            <button onClick={() => execCommand('italic')} title="Курсив">
              <Italic size={18} />
            </button>
            <button onClick={() => execCommand('underline')} title="Подчёркнутый">
              <Underline size={18} />
            </button>
            <button onClick={() => execCommand('strikeThrough')} title="Зачёркнутый">
              <Strikethrough size={18} />
            </button>
            <div className="toolbar-divider" />
            <button onClick={() => execCommand('fontSize', '5')} title="Крупный текст">
              <Type size={20} />
            </button>
            <button onClick={() => execCommand('fontSize', '3')} title="Обычный текст">
              <Type size={14} />
            </button>
          </div>
          <div
            ref={editorRef}
            className="note-content-editor"
            contentEditable
            data-placeholder="Текст заметки..."
          />
          <div className="editor-actions">
            <button className="btn-cancel" onClick={closeEditor}>
              Отмена
            </button>
            <button className="btn-save" onClick={handleSave}>
              {editingNote ? 'Обновить' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="empty-state">
          <p>Нет заметок</p>
          <p>Создайте первую заметку</p>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map(note => (
            <div key={note.id} className="note-card-wrapper">
              <div className={`swipe-action swipe-pin ${swipedNoteId === note.id && swipeDirection === 'right' ? 'visible' : ''}`}>
                <Pin size={20} />
                <span>{note.is_pinned ? 'Открепить' : 'Закрепить'}</span>
              </div>
              <div className={`swipe-action swipe-delete ${swipedNoteId === note.id && swipeDirection === 'left' ? 'visible' : ''}`}>
                <Trash2 size={20} />
                <span>Удалить</span>
              </div>
              <div
                className={`note-card ${note.is_pinned ? 'pinned' : ''} ${swipedNoteId === note.id ? `swiping-${swipeDirection || ''}` : ''}`}
                onClick={() => setSelectedNote(note)}
                onTouchStart={e => handleTouchStart(e, note.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd(note.id, note.is_pinned)}
              >
                <div className="note-card-header">
                  <div className="note-card-text">
                    <h3>{note.title}</h3>
                    {note.content && <p className="note-preview">{getPreview(note.content, note.title)}</p>}
                  </div>
                  <div className="note-card-actions">
                    <button
                      className="edit-btn"
                      onClick={e => startEdit(note, e)}
                      title="Редактировать"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className={`pin-btn ${note.is_pinned ? 'active' : ''}`}
                      onClick={e => handlePin(note.id, note.is_pinned, e)}
                      title={note.is_pinned ? 'Открепить' : 'Закрепить'}
                    >
                      <Pin size={16} />
                    </button>
                    <button
                      className="delete-btn"
                      onClick={e => handleDelete(note.id, e)}
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <span className="note-date">{formatDate(note.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedNote && (
        <div className="modal-overlay" onClick={() => setSelectedNote(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedNote.title}</h2>
              <button className="close-btn" onClick={() => setSelectedNote(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-meta">
              {formatDate(selectedNote.created_at)}
              {selectedNote.is_pinned && <span className="pinned-badge"><Pin size={12} /> Закреплено</span>}
            </div>
            <div
              className="modal-content"
              dangerouslySetInnerHTML={{ __html: getContentWithoutTitle(selectedNote.content, selectedNote.title) }}
            />
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="modal-overlay confirm-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">
              <AlertTriangle size={32} />
            </div>
            <h3>Удалить заметку?</h3>
            <p className="confirm-note-title">«{confirmModal.title}»</p>
            <p className="confirm-text">Это действие нельзя отменить</p>
            <div className="confirm-actions">
              <button className="confirm-btn-cancel" onClick={() => setConfirmModal(null)}>
                Отмена
              </button>
              <button className="confirm-btn-delete" onClick={confirmDelete}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
