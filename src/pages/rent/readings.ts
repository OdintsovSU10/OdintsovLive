import type { ElectricityMeter } from './rentUtils'

export interface MonthReadings {
  cold_water: number
  hot_water: number
  electricity: ElectricityMeter[]
}

export interface ReadingIssue {
  level: 'error' | 'warning'
  text: string
}

export interface ReadingRow {
  id: string
  label: string
  kind: 'electricity' | 'water'
  prev: number | null
  cur: number | null
  usage: number | null
  issue: ReadingIssue | null
}

export type RentStage = 'photos' | 'recognizing' | 'incomplete' | 'error' | 'ready' | 'paid'

const DEFAULT_METERS = ['T1', 'T2', 'T3']

// Скачок расхода считаем подозрительным, если он в 2,5 раза больше прошлого и заметен по объёму
const JUMP_RATIO = 2.5
const JUMP_MIN_DELTA = { electricity: 50, water: 5 }

const round2 = (value: number) => Math.round(value * 100) / 100
const positive = (value: number | undefined) => (value && value > 0 ? value : null)

const findIssue = (
  label: string,
  kind: ReadingRow['kind'],
  usage: number | null,
  prevUsage: number | null
): ReadingIssue | null => {
  if (usage === null) return null
  if (usage < 0) return { level: 'error', text: `${label}: меньше, чем в прошлом месяце` }
  if (prevUsage && usage > prevUsage * JUMP_RATIO && usage - prevUsage >= JUMP_MIN_DELTA[kind]) {
    const ratio = (usage / prevUsage).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
    return { level: 'warning', text: `${label}: расход в ${ratio} раза больше, чем месяцем ранее — сверьте с фото` }
  }
  return null
}

const diff = (cur: number | null, prev: number | null, kind: ReadingRow['kind']) => {
  if (cur === null || prev === null) return null
  return kind === 'water' ? Math.floor(cur) - Math.floor(prev) : round2(cur - prev)
}

// Строки таблицы «было → стало → расход» с проверками
export const buildReadingRows = (
  cur: MonthReadings,
  prev: MonthReadings | null,
  prevPrev: MonthReadings | null
): ReadingRow[] => {
  const names = Array.from(new Set([
    ...(prev?.electricity ?? []).map(m => m.name),
    ...cur.electricity.map(m => m.name)
  ])).sort((a, b) => a.localeCompare(b))

  const electricityRows = (names.length > 0 ? names : DEFAULT_METERS).map(name => {
    const find = (readings: MonthReadings | null) => positive(readings?.electricity.find(m => m.name === name)?.value)
    const curValue = find(cur)
    const prevValue = find(prev)
    const usage = diff(curValue, prevValue, 'electricity')
    const prevUsage = diff(prevValue, find(prevPrev), 'electricity')
    return {
      id: name,
      label: name,
      kind: 'electricity' as const,
      prev: prevValue,
      cur: curValue,
      usage,
      issue: findIssue(name, 'electricity', usage, prevUsage)
    }
  })

  const waterRow = (id: 'cold' | 'hot', label: string, field: 'cold_water' | 'hot_water'): ReadingRow => {
    const curValue = positive(cur[field])
    const prevValue = positive(prev?.[field])
    const usage = diff(curValue, prevValue, 'water')
    const prevUsage = diff(prevValue, positive(prevPrev?.[field]), 'water')
    return {
      id,
      label,
      kind: 'water',
      prev: prevValue,
      cur: curValue,
      usage,
      issue: findIssue(label, 'water', usage, prevUsage)
    }
  }

  const cold = waterRow('cold', 'ХВС', 'cold_water')
  const hot = waterRow('hot', 'ГВС', 'hot_water')
  if (!cold.issue && cold.cur !== null && hot.cur !== null && cold.cur < hot.cur) {
    cold.issue = { level: 'warning', text: 'ХВС меньше ГВС — похоже, перепутаны местами' }
  }

  return [...electricityRows, cold, hot]
}

// Чего не хватает, чтобы посчитать воду и отправить сообщение
export const findMissing = (rows: ReadingRow[], hasWaterTariffs: boolean): string[] => {
  const missing: string[] = []
  const noCurrent = rows.filter(r => r.cur === null).map(r => r.label)
  if (noCurrent.length > 0) missing.push(`нет показаний ${noCurrent.join(', ')}`)
  if (rows.some(r => r.prev === null)) missing.push('нет показаний за прошлый месяц')
  if (!hasWaterTariffs) missing.push('нет тарифов воды')
  return missing
}

export const getRentStage = (params: {
  paid: boolean
  activeJobs: number
  rows: ReadingRow[]
  missing: string[]
}): RentStage => {
  if (params.paid) return 'paid'
  if (params.activeJobs > 0) return 'recognizing'
  if (params.rows.every(r => r.cur === null)) return 'photos'
  if (params.rows.some(r => r.issue?.level === 'error')) return 'error'
  if (params.missing.length > 0) return 'incomplete'
  return 'ready'
}

export const formatReading = (value: number | null, kind: ReadingRow['kind']) => {
  if (value === null) return '—'
  return kind === 'water'
    ? value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
    : value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const formatUsage = (value: number | null, kind: ReadingRow['kind']) => {
  if (value === null) return ''
  const text = formatReading(Math.abs(value), kind)
  return value < 0 ? `−${text}` : `+${text}`
}
