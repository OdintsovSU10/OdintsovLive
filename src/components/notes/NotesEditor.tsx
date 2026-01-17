import { useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Pin, Trash2 } from 'lucide-react'
import { EditorProps } from './types'
import { useSwipeBack, useAutoSave, useSelectionMenu, useKeyboardHandlers } from './hooks'
import { execCommand, insertTodoItem, applyQuote } from './editorCommands'
import { EditorToolbar, SelectionMenu } from './components'

export default function NotesEditor({ note, isSaving, onSave, onClose, onDelete, onPin }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorPageRef = useRef<HTMLDivElement>(null)

  const swipeBackProgress = useSwipeBack(onClose)
  const triggerAutoSave = useAutoSave(editorRef, onSave)
  const { selectionMenu, checkSelection, handleSelectionChange, clearSelectionMenu } = useSelectionMenu(editorRef)
  const handleEditorKeyDown = useKeyboardHandlers(editorRef, triggerAutoSave)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = note?.content || ''
      editorRef.current.focus()
    }
  }, [note?.id])

  useEffect(() => {
    document.body.dataset.notesEditor = 'true'
    const handleBackEvent = () => onClose()
    window.addEventListener('notes-editor-back', handleBackEvent)
    return () => {
      delete document.body.dataset.notesEditor
      window.removeEventListener('notes-editor-back', handleBackEvent)
    }
  }, [onClose])

  const handleExecCommand = useCallback((command: string, value?: string) => {
    execCommand(editorRef, command, triggerAutoSave, value)
  }, [triggerAutoSave])

  const handleInsertTodoItem = useCallback(() => {
    insertTodoItem(editorRef, triggerAutoSave)
  }, [triggerAutoSave])

  const handleApplyQuote = useCallback(() => {
    applyQuote(editorRef, triggerAutoSave, clearSelectionMenu)
  }, [triggerAutoSave, clearSelectionMenu])

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    clearSelectionMenu()

    if (target.classList.contains('todo-circle')) {
      e.preventDefault()
      const todoItem = target.closest('.todo-item')
      if (todoItem) {
        todoItem.classList.toggle('completed')
        triggerAutoSave()
      }
      return
    }

    if (target.classList.contains('todo-item')) {
      const textSpan = target.querySelector('.todo-text')
      if (textSpan) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(textSpan)
        range.collapse(false)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }

  return (
    <div
      className="notes-editor-page"
      ref={editorPageRef}
      style={{ transform: `translateX(${swipeBackProgress * 100}px)`, opacity: 1 - swipeBackProgress * 0.3 }}
    >
      <div className="editor-header">
        <button className="back-btn desktop-only" onClick={onClose}>
          <ArrowLeft size={20} />
          <span>Назад</span>
        </button>
        {note && (
          <div className="editor-header-actions mobile-only">
            <button className={`pin-btn ${note.is_pinned ? 'active' : ''}`} onClick={() => onPin(note.id, note.is_pinned)}>
              <Pin size={18} />
            </button>
            <button className="delete-btn" onClick={() => onDelete(note.id)}>
              <Trash2 size={18} />
            </button>
          </div>
        )}
        <div className="editor-status">{isSaving ? 'Сохранение...' : 'Сохранено'}</div>
      </div>

      <EditorToolbar
        note={note}
        onExecCommand={handleExecCommand}
        onInsertTodoItem={handleInsertTodoItem}
        onApplyQuote={handleApplyQuote}
        onPin={onPin}
        onDelete={onDelete}
      />

      <div
        ref={editorRef}
        className="note-content-editor"
        contentEditable
        data-placeholder="Текст заметки..."
        onClick={handleEditorClick}
        onKeyDown={handleEditorKeyDown}
        onInput={triggerAutoSave}
        onMouseUp={handleSelectionChange}
        onTouchEnd={() => setTimeout(checkSelection, 300)}
      />

      {selectionMenu && (
        <SelectionMenu x={selectionMenu.x} y={selectionMenu.y} onApplyQuote={handleApplyQuote} />
      )}
    </div>
  )
}
