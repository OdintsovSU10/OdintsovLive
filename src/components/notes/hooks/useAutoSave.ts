import { useRef, useCallback } from 'react'

export function useAutoSave(
  editorRef: React.RefObject<HTMLDivElement | null>,
  onSave: (content: string) => void
) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const triggerAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      onSave(editorRef.current?.innerHTML || '')
    }, 500)
  }, [onSave, editorRef])

  return triggerAutoSave
}
