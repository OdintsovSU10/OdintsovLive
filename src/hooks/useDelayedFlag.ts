import { useEffect, useState } from 'react'

// true только если value держится дольше delayMs: короткая загрузка не мигает спиннером
export function useDelayedFlag(value: boolean, delayMs = 400): boolean {
  const [delayed, setDelayed] = useState(false)

  useEffect(() => {
    if (!value) {
      setDelayed(false)
      return
    }
    const timer = window.setTimeout(() => setDelayed(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return value && delayed
}
