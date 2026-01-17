import { useState, useRef, useCallback } from 'react'

export function useSelectionMenu(editorRef: React.RefObject<HTMLDivElement | null>) {
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null)
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const checkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !editorRef.current) {
      setSelectionMenu(null)
      return
    }
    const selectedText = selection.toString().trim()
    if (!selectedText) {
      setSelectionMenu(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      setSelectionMenu(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setSelectionMenu({ x: rect.left + rect.width / 2, y: rect.top - 10 })
  }, [editorRef])

  const handleSelectionChange = useCallback(() => {
    if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current)
    selectionTimeoutRef.current = setTimeout(checkSelection, 200)
  }, [checkSelection])

  const clearSelectionMenu = useCallback(() => {
    setSelectionMenu(null)
  }, [])

  return { selectionMenu, checkSelection, handleSelectionChange, clearSelectionMenu }
}
