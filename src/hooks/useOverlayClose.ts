import { useRef, type MouseEvent } from 'react'

// Закрытие модалки кликом по фону — только если и нажали, и отпустили на самом фоне.
// Иначе выделение текста в модалке с отпусканием мыши снаружи закрывает её.
export function useOverlayClose(onClose: () => void) {
  const pressedOnOverlay = useRef(false)

  return {
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      pressedOnOverlay.current = event.target === event.currentTarget
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const shouldClose = pressedOnOverlay.current && event.target === event.currentTarget
      pressedOnOverlay.current = false
      if (shouldClose) onClose()
    }
  }
}
