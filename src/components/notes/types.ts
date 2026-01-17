export interface Note {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
}

export interface EditorProps {
  note: Note | null
  isSaving: boolean
  onSave: (content: string) => void
  onClose: () => void
  onDelete: (id: string) => void
  onPin: (id: string, isPinned: boolean) => void
}
