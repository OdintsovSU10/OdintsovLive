import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { EmployeeWithStats, TenderEmployeeEvent } from '../types'

export interface SalaryRaiseTimelineItem {
  kind: 'raise'
  key: string
  date: string
  timestamp: number
  fromSalary: number
  toSalary: number
  delta: number
  deltaPercent: number
  monthsBetween: number
  note: string | null
}

export interface EmployeeEventTimelineItem {
  kind: 'event'
  key: string
  date: string
  timestamp: number
  eventType: 'archive' | 'unarchive'
  note: string | null
}

export type SalaryTimelineItem = SalaryRaiseTimelineItem | EmployeeEventTimelineItem

function isMissingEmployeeEventsError(
  error: { code?: string; message?: string | null; details?: string | null; hint?: string | null } | null,
  status?: number | null
): boolean {
  if (status === 404) return true
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const combined = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return combined.includes('tender_employee_events')
    && (combined.includes('does not exist') || combined.includes('could not find the table') || combined.includes('not found'))
}

// Повышения оклада и события архива сотрудника, новые сверху
export function useEmployeeSalaryTimeline(employee: EmployeeWithStats) {
  const [employeeEvents, setEmployeeEvents] = useState<TenderEmployeeEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadEmployeeEvents = async () => {
      setLoadingEvents(true)
      try {
        const { data, error, status } = await supabase
          .from('tender_employee_events')
          .select('*')
          .eq('employee_id', employee.id)
          .in('event_type', ['archive', 'unarchive'])
          .order('event_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (error) {
          if (isMissingEmployeeEventsError(error, status)) {
            if (!cancelled) setEmployeeEvents([])
            return
          }
          throw error
        }
        if (!cancelled) setEmployeeEvents((data || []) as TenderEmployeeEvent[])
      } catch (err) {
        console.error('Error loading employee events:', err)
        if (!cancelled) setEmployeeEvents([])
      } finally {
        if (!cancelled) setLoadingEvents(false)
      }
    }

    loadEmployeeEvents()
    return () => {
      cancelled = true
    }
  }, [employee.id])

  const raises = useMemo(() => {
    const salaryHistory = [...(employee.salaryHistory || [])]
      .sort((left, right) => new Date(`${left.effective_date}T12:00:00`).getTime() - new Date(`${right.effective_date}T12:00:00`).getTime())

    const result: SalaryRaiseTimelineItem[] = []

    for (let i = 1; i < salaryHistory.length; i++) {
      const prev = salaryHistory[i - 1]
      const current = salaryHistory[i]
      const delta = current.salary - prev.salary
      if (delta <= 0) continue
      const prevDate = new Date(`${prev.effective_date}T12:00:00`)
      const currentDate = new Date(`${current.effective_date}T12:00:00`)
      const monthsBetween = Math.max(
        0,
        (currentDate.getFullYear() - prevDate.getFullYear()) * 12
        + (currentDate.getMonth() - prevDate.getMonth())
      )

      result.push({
        kind: 'raise',
        key: `${current.id}-${current.effective_date}`,
        date: current.effective_date,
        timestamp: new Date(`${current.effective_date}T12:00:00`).getTime(),
        fromSalary: prev.salary,
        toSalary: current.salary,
        delta,
        deltaPercent: prev.salary > 0 ? (delta / prev.salary) * 100 : 0,
        monthsBetween,
        note: current.note
      })
    }

    return result.reverse()
  }, [employee.salaryHistory])

  const items = useMemo<SalaryTimelineItem[]>(() => {
    const eventItems: EmployeeEventTimelineItem[] = employeeEvents
      .filter(item => item.event_type === 'archive' || item.event_type === 'unarchive')
      .map(item => ({
        kind: 'event' as const,
        key: `event-${item.id}`,
        date: item.event_date,
        timestamp: new Date(item.created_at || `${item.event_date}T12:00:00`).getTime(),
        eventType: item.event_type,
        note: item.note
      }))

    const merged: SalaryTimelineItem[] = [...raises, ...eventItems]
    merged.sort((left, right) => right.timestamp - left.timestamp)
    return merged
  }, [employeeEvents, raises])

  return { items, latestRaise: raises[0] ?? null, loadingEvents }
}
