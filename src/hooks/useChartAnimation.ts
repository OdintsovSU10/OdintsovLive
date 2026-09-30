import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

export const CHART_ANIMATION_MS = 300

// Анимация графика только при первом показе: смена периода не должна «мигать»
export function useChartAnimation(): boolean {
  const reduced = useReducedMotion()
  const [firstRender, setFirstRender] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setFirstRender(false), CHART_ANIMATION_MS + 100)
    return () => window.clearTimeout(timer)
  }, [])

  return firstRender && !reduced
}
