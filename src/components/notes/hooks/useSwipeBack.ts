import { useEffect, useState, useRef } from 'react'

export function useSwipeBack(onClose: () => void) {
  const [swipeBackProgress, setSwipeBackProgress] = useState(0)
  const editorSwipeStartX = useRef(0)
  const isEditorSwipe = useRef(false)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      document.body.dataset.editorSwipe = 'true'
      if (touch.clientX < 40) {
        editorSwipeStartX.current = touch.clientX
        isEditorSwipe.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (isEditorSwipe.current) {
        const diff = e.touches[0].clientX - editorSwipeStartX.current
        setSwipeBackProgress(Math.min(Math.max(diff / 150, 0), 1))
      }
    }

    const handleTouchEnd = () => {
      if (isEditorSwipe.current && swipeBackProgress > 0.5) {
        onClose()
      }
      editorSwipeStartX.current = 0
      isEditorSwipe.current = false
      setSwipeBackProgress(0)
      setTimeout(() => { delete document.body.dataset.editorSwipe }, 50)
    }

    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true })
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      delete document.body.dataset.editorSwipe
    }
  }, [swipeBackProgress, onClose])

  return swipeBackProgress
}
