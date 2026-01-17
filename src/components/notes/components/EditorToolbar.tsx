import { Bold, Italic, Underline, Strikethrough, Type, List, ListOrdered, CheckCircle2, Quote, Pin, Trash2 } from 'lucide-react'
import { Note } from '../types'

interface Props {
  note: Note | null
  onExecCommand: (command: string, value?: string) => void
  onInsertTodoItem: () => void
  onApplyQuote: () => void
  onPin: (id: string, isPinned: boolean) => void
  onDelete: (id: string) => void
}

export default function EditorToolbar({ note, onExecCommand, onInsertTodoItem, onApplyQuote, onPin, onDelete }: Props) {
  return (
    <div className="editor-toolbar">
      <button onClick={() => onExecCommand('bold')} title="Жирный"><Bold size={18} /></button>
      <button onClick={() => onExecCommand('italic')} title="Курсив"><Italic size={18} /></button>
      <button onClick={() => onExecCommand('underline')} title="Подчёркнутый"><Underline size={18} /></button>
      <button onClick={() => onExecCommand('strikeThrough')} title="Зачёркнутый"><Strikethrough size={18} /></button>
      <div className="toolbar-divider" />
      <button onClick={() => onExecCommand('fontSize', '5')} title="Крупный текст"><Type size={20} /></button>
      <button onClick={() => onExecCommand('fontSize', '3')} title="Обычный текст"><Type size={14} /></button>
      <div className="toolbar-divider" />
      <button onClick={() => onExecCommand('insertUnorderedList')} title="Маркированный список"><List size={18} /></button>
      <button onClick={() => onExecCommand('insertOrderedList')} title="Нумерованный список"><ListOrdered size={18} /></button>
      <button onClick={onInsertTodoItem} title="Пункт с галочкой"><CheckCircle2 size={18} /></button>
      <div className="toolbar-divider" />
      <button onClick={onApplyQuote} title="Цитата"><Quote size={18} /></button>
      {note && (
        <div className="toolbar-actions desktop-only">
          <div className="toolbar-divider toolbar-spacer" />
          <button
            className={`pin-btn ${note.is_pinned ? 'active' : ''}`}
            onClick={() => onPin(note.id, note.is_pinned)}
            title={note.is_pinned ? 'Открепить' : 'Закрепить'}
          >
            <Pin size={18} />
          </button>
          <button className="delete-btn" onClick={() => onDelete(note.id)} title="Удалить">
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
