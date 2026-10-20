import type { EmployeeWithStats } from '../types'

const SUBDIVISION_ORDER = [
  'Руководитель',
  'Ведущий',
  'Секретариат',
  'Общестрой',
  'Фасады',
  'Отделка',
  'ВИС электрика',
  'ВИС механика',
  'Юр отдел'
]

const SUBDIVISION_ACCENTS = [
  '#818cf8',
  '#38bdf8',
  '#22d3ee',
  '#14b8a6',
  '#a78bfa',
  '#60a5fa',
  '#34d399'
]

export interface IEmployeeGroup {
  name: string
  employees: EmployeeWithStats[]
}

export type MissingField = 'position' | 'department' | 'subdivision' | 'phone' | 'email' | 'salary'

function getSubdivisionOrder(subdiv: string | null): number {
  if (!subdiv) return 999
  const lower = subdiv.toLowerCase()
  const idx = SUBDIVISION_ORDER.findIndex(s => lower.includes(s.toLowerCase()))
  return idx >= 0 ? idx : 999
}

function hashText(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function getSubdivisionAccent(name: string): string {
  return SUBDIVISION_ACCENTS[hashText(name) % SUBDIVISION_ACCENTS.length]
}

const isBlank = (value: string | null | undefined) => !value || value.trim().length === 0

// Поля с пробелами: пустой текст или нулевой оклад
export function getMissingFields(employee: EmployeeWithStats): Set<MissingField> {
  const missing = new Set<MissingField>()
  if (isBlank(employee.position)) missing.add('position')
  if (isBlank(employee.department)) missing.add('department')
  if (isBlank(employee.subdivision)) missing.add('subdivision')
  if (isBlank(employee.phone)) missing.add('phone')
  if (isBlank(employee.email)) missing.add('email')
  if (!(employee.current_salary > 0)) missing.add('salary')
  return missing
}

export const isIncompleteEmployee = (employee: EmployeeWithStats) => getMissingFields(employee).size > 0

// Руководители наверх отдельной группой, остальные — по подразделениям в заданном порядке
export function groupEmployees(employees: EmployeeWithStats[]): IEmployeeGroup[] {
  const isHead = (pos: string | undefined) => (pos?.toLowerCase() || '').includes('руководитель')
  const heads = employees.filter(e => isHead(e.position))
  const rest = employees.filter(e => !isHead(e.position))

  const groups: Record<string, EmployeeWithStats[]> = {}
  for (const emp of rest) {
    const key = emp.subdivision || 'Без подразделения'
    if (!groups[key]) groups[key] = []
    groups[key].push(emp)
  }

  // Внутри групп старший группы первым
  const getPriority = (pos: string | undefined) => ((pos?.toLowerCase() || '').includes('старший группы') ? 0 : 1)
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => getPriority(a.position) - getPriority(b.position))
  }

  const sorted = Object.entries(groups)
    .sort(([a], [b]) => getSubdivisionOrder(a) - getSubdivisionOrder(b))

  if (heads.length > 0) {
    sorted.unshift(['Руководство', heads])
  }

  return sorted.map(([name, groupEmployees]) => ({ name, employees: groupEmployees }))
}
