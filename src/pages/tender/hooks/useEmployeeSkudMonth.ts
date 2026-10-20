import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFotEmployeeEvents, type FotEmployeeEvent } from '../utils/fotEmployeeEvents'

const CACHE_TTL_MS = 2 * 60 * 1000

const monthCache = new Map<string, { at: number; events: FotEmployeeEvent[] }>()

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const monthText = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`
  }
}

function readCache(key: string): FotEmployeeEvent[] | null {
  const item = monthCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > CACHE_TTL_MS) {
    monthCache.delete(key)
    return null
  }
  return item.events
}

// События СКУД месяца: используют и календарь (запасной источник), и панель дня
export function useEmployeeSkudMonth(fotEmployeeId: string | null, year: number, month: number) {
  const [events, setEvents] = useState<FotEmployeeEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!fotEmployeeId) {
      setEvents([])
      setError(null)
      setLoading(false)
      return undefined
    }

    const key = `${fotEmployeeId}-${year}-${month}`
    const cached = readCache(key)
    if (cached) {
      setEvents(cached)
      setError(null)
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    const { from, to } = getMonthRange(year, month)

    setLoading(true)
    setError(null)
    setEvents([])
    fetchFotEmployeeEvents(fotEmployeeId, from, to, controller.signal)
      .then(result => {
        monthCache.set(key, { at: Date.now(), events: result })
        if (controller.signal.aborted) return
        setEvents(result)
      })
      .catch(err => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setEvents([])
        setError(err instanceof Error ? err.message : 'Не удалось загрузить события FOT')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [attempt, fotEmployeeId, month, year])

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, FotEmployeeEvent[]>()
    for (const event of events) {
      const dayEvents = grouped.get(event.event_date) || []
      dayEvents.push(event)
      grouped.set(event.event_date, dayEvents)
    }
    for (const dayEvents of grouped.values()) {
      dayEvents.sort((left, right) => left.event_time.localeCompare(right.event_time))
    }
    return grouped
  }, [events])

  const reload = useCallback(() => {
    monthCache.clear()
    setAttempt(value => value + 1)
  }, [])

  return { eventsByDate, loading, error, reload }
}

export type EmployeeSkudMonth = ReturnType<typeof useEmployeeSkudMonth>
