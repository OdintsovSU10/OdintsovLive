import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_DURATION = 4000

export interface ToastData {
  id: number
  message: string
  tone: 'default' | 'error'
  duration: number
  actionLabel?: string
  onAction?: () => void
}

type ToastOptions = Pick<ToastData, 'message'> & Partial<Omit<ToastData, 'id' | 'message'>>

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const hideToast = useCallback(() => {
    clearTimer()
    setToast(null)
  }, [])

  const showToast = useCallback((options: ToastOptions) => {
    clearTimer()
    const next: ToastData = { tone: 'default', duration: DEFAULT_DURATION, ...options, id: Date.now() }
    setToast(next)
    timerRef.current = window.setTimeout(() => setToast(null), next.duration)
  }, [])

  useEffect(() => clearTimer, [])

  return { toast, showToast, hideToast }
}
