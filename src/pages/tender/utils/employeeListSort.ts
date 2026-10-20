import type { EmployeeWithStats } from '../types'
import type { IListScore } from '../hooks/useEmployeeScores'
import { getEffectiveSalaryForDate, getTodayIsoDate } from './adminTenderHelpers'
import { getEmployeeTenureMonths, getMonthsSinceLastRaise } from './tenderPresentation'

export type EmployeeSortKey = 'name' | 'score' | 'salary' | 'noRaise' | 'tenure'
export type SortDirection = 'asc' | 'desc'

export interface IEmployeeSort {
  key: EmployeeSortKey
  dir: SortDirection
}

// Выбор сортировки списка запоминаем в браузере
const SORT_STORAGE_KEY = 'tender-admin-sort'
const SORT_KEYS: readonly EmployeeSortKey[] = ['name', 'score', 'salary', 'noRaise', 'tenure']

export const readSavedSort = (): IEmployeeSort | null => {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IEmployeeSort> | null
    if (!parsed || !SORT_KEYS.includes(parsed.key as EmployeeSortKey)) return null
    if (parsed.dir !== 'asc' && parsed.dir !== 'desc') return null
    return { key: parsed.key as EmployeeSortKey, dir: parsed.dir }
  } catch {
    return null
  }
}

export const saveSort = (sort: IEmployeeSort): void => {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
  } catch {
    // Хранилище недоступно (приватный режим) — сортировка работает до перезагрузки
  }
}

// Первый клик по колонке: оценка — от большей к меньшей, остальные — по возрастанию
export const getNextSort = (current: IEmployeeSort | null, key: EmployeeSortKey): IEmployeeSort => {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'score' ? 'desc' : 'asc' }
}

// Сортировка внутри группы подразделения; без выбранной сортировки порядок не меняется.
// Сотрудники без оценки («—») всегда в конце, при равенстве сохраняется исходный порядок.
export const sortEmployees = (
  employees: EmployeeWithStats[],
  sort: IEmployeeSort | null,
  scores: Map<number, IListScore>
): EmployeeWithStats[] => {
  if (!sort) return employees
  const sign = sort.dir === 'asc' ? 1 : -1
  const todayIso = getTodayIsoDate()

  const numeric = (employee: EmployeeWithStats): number | null => {
    if (sort.key === 'score') return scores.get(employee.id)?.total ?? null
    if (sort.key === 'salary') {
      return getEffectiveSalaryForDate(employee.salaryHistory || [], employee.current_salary, todayIso)
    }
    if (sort.key === 'noRaise') return getMonthsSinceLastRaise(employee)
    return getEmployeeTenureMonths(employee)
  }

  return [...employees].sort((left, right) => {
    if (sort.key === 'name') return sign * left.full_name.localeCompare(right.full_name, 'ru-RU')
    const leftValue = numeric(left)
    const rightValue = numeric(right)
    if (leftValue === null || rightValue === null) {
      if (leftValue === rightValue) return 0
      return leftValue === null ? 1 : -1
    }
    return sign * (leftValue - rightValue)
  })
}
