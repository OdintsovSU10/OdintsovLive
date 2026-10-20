import { useCallback, useEffect, useMemo, useState } from 'react'
import { toIsoDate } from '../utils/employeeFormat'
import {
  addDaysIso,
  computeWindowScore,
  getScoreSignals,
  getScoreWindow,
  type ScoreGrade,
  type ScoreSignalKey,
  type ScoreWindow
} from '../utils/employeeScore'
import { isScoreColleague, loadScoreData, SCORE_CACHE_TTL_MS, toScoreMember, type ScoreData } from '../utils/scoreData'
import { getMonthsSinceLastRaise } from '../utils/tenderPresentation'
import type { EmployeeWithStats } from '../types'

const LOAD_ERROR = 'Не удалось загрузить данные для оценки'

export interface IListScore {
  // null — мало данных
  total: number | null
  grade: ScoreGrade | null
  rank: number | null
  rankOf: number
  signals: ScoreSignalKey[]
}

// Кеш на все списки: ключ — дата окна и состав сотрудников
const listCache = new Map<string, ScoreData>()
const listInflight = new Map<string, Promise<ScoreData>>()

function readCache(key: string): ScoreData | null {
  const item = listCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > SCORE_CACHE_TTL_MS) {
    listCache.delete(key)
    return null
  }
  return item
}

function fetchListData(key: string, ids: number[], from: string, to: string): Promise<ScoreData> {
  const pending = listInflight.get(key)
  if (pending) return pending

  const request = loadScoreData(ids, from, to)
    .then(data => {
      listCache.set(key, data)
      return data
    })
    .finally(() => {
      listInflight.delete(key)
    })

  listInflight.set(key, request)
  return request
}

// Оценка по текущему окну (90 дней по вчера) для каждого сотрудника списка.
// Состав отдела тот же, что в карточке сотрудника: активные участники табеля плюс сам сотрудник.
function buildScores(employees: EmployeeWithStats[], data: ScoreData, scoreWindow: ScoreWindow) {
  const colleaguesByDepartment = new Map<string, EmployeeWithStats[]>()
  for (const employee of employees) {
    if (!employee.department || !isScoreColleague(employee)) continue
    const list = colleaguesByDepartment.get(employee.department) || []
    list.push(employee)
    colleaguesByDepartment.set(employee.department, list)
  }

  const scores = new Map<number, IListScore>()
  for (const employee of employees) {
    if (employee.is_archived) continue
    const colleagues = employee.department ? colleaguesByDepartment.get(employee.department) || [] : []
    const roster = [employee, ...colleagues.filter(item => item.id !== employee.id)]
    const score = computeWindowScore(roster.map(item => toScoreMember(item, data)), employee.id, scoreWindow)
    scores.set(employee.id, {
      total: score.total,
      grade: score.grade,
      rank: score.rank,
      rankOf: score.rankTotal,
      signals: getScoreSignals(score, getMonthsSinceLastRaise(employee))
    })
  }
  return scores
}

interface LoadState {
  key: string
  data: ScoreData | null
  error: string | null
}

// Оценки сразу для всего списка одним проходом; число совпадает с карточкой сотрудника
export function useEmployeeScores(employees: EmployeeWithStats[]) {
  const [today] = useState(() => new Date())
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const scoreWindow = useMemo(() => getScoreWindow(addDaysIso(todayIso, -1)), [todayIso])

  const ids = useMemo(
    () => employees.filter(employee => !employee.is_archived).map(employee => employee.id).sort((a, b) => a - b),
    [employees]
  )
  const idsKey = ids.join(',')
  const key = `${scoreWindow.to}|${idsKey}`

  const [state, setState] = useState<LoadState>(() => ({ key, data: readCache(key), error: null }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (ids.length === 0) {
      setState({ key, data: null, error: null })
      return undefined
    }
    const cached = readCache(key)
    if (cached) {
      setState({ key, data: cached, error: null })
      return undefined
    }

    let cancelled = false
    setState({ key, data: null, error: null })
    fetchListData(key, ids, scoreWindow.from, scoreWindow.to)
      .then(data => {
        if (!cancelled) setState({ key, data, error: null })
      })
      .catch(err => {
        console.error('Error loading employee scores:', err)
        if (!cancelled) setState({ key, data: null, error: LOAD_ERROR })
      })

    return () => {
      cancelled = true
    }
    // ids пересоздаётся при каждом пересчёте списка, поэтому зависимость — ключ key
  }, [attempt, key, scoreWindow.from, scoreWindow.to])

  const reload = useCallback(() => {
    listCache.delete(key)
    setAttempt(value => value + 1)
  }, [key])

  const current = state.key === key ? state : null
  // Пока эффект не отработал после смены состава, берём готовое из кеша — без мигания скелетона
  const data = current?.data ?? readCache(key)

  const scores = useMemo(
    () => (data ? buildScores(employees, data, scoreWindow) : new Map<number, IListScore>()),
    [data, employees, scoreWindow]
  )

  return {
    scores,
    loading: ids.length > 0 && data === null && (!current || current.error === null),
    error: current?.error ?? null,
    reload
  }
}
