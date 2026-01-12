import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import NotesEditor from '../components/notes/NotesEditor'
import NoteCard from '../components/notes/NoteCard'
import ConfirmModal from '../components/ConfirmModal'
import './NotesPage.css'

interface Note {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
}

const extractTitle = (html: string) => {
  const container = document.createElement('div')
  container.innerHTML = html
  let firstLine = ''
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim()
      if (text) { firstLine = text; break }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const text = (el.textContent || '').trim()
      if (text) { firstLine = text; break }
    }
  }
  if (!firstLine) return 'Без названия'
  const words = firstLine.split(/\s+/).filter(w => w)
  return words.slice(0, 5).join(' ') || 'Без названия'
}

const getPreview = (html: string) => {
  const container = document.createElement('div')
  container.innerHTML = html
  const nodes = Array.from(container.childNodes)
  let foundFirst = false
  let preview = ''
  for (const node of nodes) {
    const text = (node.textContent || '').trim()
    if (!text) continue
    if (!foundFirst) { foundFirst = true; continue }
    preview += (preview ? ' ' : '') + text
    if (preview.length > 150) break
  }
  return preview.length > 150 ? preview.slice(0, 150) + '...' : preview
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ noteId: string; title: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { loadNotes() }, [])

  const loadNotes = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (data) setNotes(data)
    setLoading(false)
  }

  const handleSave = async (content: string) => {
    if (!content.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setIsSaving(true)
    const title = extractTitle(content)
    if (editingNote) {
      await supabase.from('notes').update({ title, content, updated_at: new Date().toISOString() }).eq('id', editingNote.id)
      setEditingNote({ ...editingNote, title, content })
    } else {
      const { data } = await supabase.from('notes').insert({ user_id: user.id, title, content }).select().single()
      if (data) setEditingNote(data)
    }
    setIsSaving(false)
    loadNotes()
  }

  const openEditor = (note?: Note) => {
    setEditingNote(note || null)
    setViewMode('editor')
  }

  const closeEditor = () => {
    setViewMode('list')
    setEditingNote(null)
  }

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const note = notes.find(n => n.id === id)
    setConfirmModal({ noteId: id, title: note?.title || 'эту заметку' })
  }

  const confirmDelete = async () => {
    if (!confirmModal) return
    await supabase.from('notes').delete().eq('id', confirmModal.noteId)
    loadNotes()
    if (editingNote?.id === confirmModal.noteId) closeEditor()
    setConfirmModal(null)
  }

  const handlePin = async (id: string, isPinned: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await supabase.from('notes').update({ is_pinned: !isPinned }).eq('id', id)
    if (editingNote?.id === id) setEditingNote({ ...editingNote, is_pinned: !isPinned })
    loadNotes()
  }

  if (loading) return <div className="notes-page"><div className="loading">Загрузка...</div></div>

  if (viewMode === 'editor') {
    return (
      <>
        <NotesEditor
          note={editingNote}
          isSaving={isSaving}
          onSave={handleSave}
          onClose={closeEditor}
          onDelete={handleDelete}
          onPin={(id, isPinned) => handlePin(id, isPinned)}
        />
        {confirmModal && (
          <ConfirmModal
            title="Удалить заметку?"
            subtitle={`«${confirmModal.title}»`}
            onConfirm={confirmDelete}
            onCancel={() => setConfirmModal(null)}
          />
        )}
      </>
    )
  }

  return (
    <div className="notes-page">
      <div className="notes-header">
        <h1>Заметки</h1>
        <button className="add-note-btn" onClick={() => openEditor()} title="Новая заметка">
          <Plus size={20} />
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="empty-state">
          <p>Нет заметок</p>
          <p>Создайте первую заметку</p>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              preview={getPreview(note.content)}
              onOpen={() => openEditor(note)}
              onDelete={(e) => handleDelete(note.id, e)}
              onPin={(e) => handlePin(note.id, note.is_pinned, e)}
            />
          ))}
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          title="Удалить заметку?"
          subtitle={`«${confirmModal.title}»`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}
