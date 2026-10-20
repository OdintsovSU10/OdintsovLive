import { useCallback, useEffect, useMemo, useState } from 'react'
import { toIsoDate } from '../utils/employeeFormat'
import { addDaysIso, buildEmployeeScoreView, type EmployeeScoreView } from '../utils/employeeScore'
import { isScoreColleague, loadScoreData, SCORE_CACHE_TTL_MS, toScoreMember, type ScoreData } from '../utils/scoreData'
import type { EmployeeWithStats } from '../types'

// Запас для окна «30 дней назад»: 90 + 90 дней и ещё день
const HISTORY_DAYS = 181
const LOAD_ERROR = 'Не удалось загрузить данные для оценки'

// Кеш по отделу и началу периода: карточки коллег одного отдела не грузят табель повторно
const scoreCache = new Map<string, ScoreData>()
const inflight = new Map<string, Promise<ScoreData>>()

function readCache(key: string, ids: number[]): ScoreData | null {
  const item = scoreCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > SCORE_CACHE_TTL_MS) {
    scoreCache.delete(key)
    return null
  }
  return ids.every(id => item.ids.has(id)) ? item : null
}

function fetchScoreData(key: string, ids: number[], from: string, to: string): Promise<ScoreData> {
  const pending = inflight.get(key)
  if (pending) return pending

  const request = loadScoreData(ids, from, to)
    .then(data => {
      scoreCache.set(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, request)
  return request
}

interface LoadState {
  key: string
  data: ScoreData | null
  error: string | null
}

// Оценка сотрудника: табель и планы всего отдела с начала года (или за последние 181 день) по вчера
export function useEmployeeScore(employee: EmployeeWithStats, peers: EmployeeWithStats[], year: number) {
  const [today] = useState(() => new Date())
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const yesterday = addDaysIso(todayIso, -1)
  const yearStart = toIsoDate(year, 1, 1)
  const historyStart = addDaysIso(todayIso, -HISTORY_DAYS)
  const from = yearStart < historyStart ? yearStart : historyStart

  // Отдел: активные участники табеля плюс сам сотрудник
  const department = employee.department
  const roster = useMemo(() => {
    const colleagues = department
      ? peers.filter(peer => (
        peer.id !== employee.id
        && peer.department === department
        && isScoreColleague(peer)
      ))
      : []
    return [employee, ...colleagues]
  }, [department, employee, peers])
  const ids = useMemo(() => roster.map(item => item.id).sort((a, b) => a - b), [roster])
  const idsKey = ids.join(',')

  const key = `${department ?? `solo-${employee.id}`}|${from}`
  const [state, setState] = useState<LoadState>(() => ({ key, data: readCache(key, ids), error: null }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const cached = readCache(key, ids)
    if (cached) {
      setState({ key, data: cached, error: null })
      return undefined
    }

    let cancelled = false
    setState({ key, data: null, error: null })
    fetchScoreData(key, ids, from, yesterday)
      .then(data => {
        if (!cancelled) setState({ key, data, error: null })
      })
      .catch(err => {
        console.error('Error loading employee score data:', err)
        if (!cancelled) setState({ key, data: null, error: LOAD_ERROR })
      })

    return () => {
      cancelled = true
    }
    // ids пересоздаётся при каждом пересчёте состава, поэтому зависимость — строка idsKey
  }, [attempt, from, idsKey, key, yesterday])

  const reload = useCallback(() => {
    scoreCache.delete(key)
    setAttempt(value => value + 1)
  }, [key])

  const current = state.key === key ? state : null
  const data = current?.data ?? null

  const view = useMemo<EmployeeScoreView | null>(() => {
    if (!data) return null
    return buildEmployeeScoreView(roster.map(item => toScoreMember(item, data)), employee.id, todayIso, year)
  }, [data, employee.id, roster, todayIso, year])

  return {
    view,
    loading: !current || (current.data === null && current.error === null),
    error: current?.error ?? null,
    reload
  }
}
