import type { JournalFilter, PeriodPreset, RecordKind } from './types'

export const FUEL_TYPES = ['АИ-95', 'АИ-100']

export const EXPENSE_CATEGORIES = [
  'Мойка',
  'Парковка',
  'Штраф',
  'Страховка',
  'Налог',
  'Запчасти',
  'Аксессуары',
  'Другое'
]

export const PART_CATEGORIES = [
  'Двигатель',
  'Трансмиссия',
  'Подвеска',
  'Тормоза',
  'Фильтры',
  'Жидкости',
  'Электрика',
  'Кузов',
  'Салон',
  'Другое'
]

export const MAINTENANCE_PRESETS = [
  'Замена масла',
  'Фильтры',
  'Колодки',
  'Свечи',
  'Ремень ГРМ',
  'Шины',
  'Диагностика'
]

// Цвет вида записи един для графиков, легенды и иконок журнала
export const KIND_META: Record<RecordKind, { label: string; color: string }> = {
  maintenance: { label: 'ТО', color: 'var(--chart-2)' },
  fuel: { label: 'Бензин', color: 'var(--chart-3)' },
  expense: { label: 'Допы', color: 'var(--chart-5)' }
}

export const RECORD_KINDS: RecordKind[] = ['fuel', 'maintenance', 'expense']

export const RECORD_TABLES: Record<RecordKind, string> = {
  maintenance: 'car_maintenance',
  fuel: 'car_fuel',
  expense: 'car_expenses'
}

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: '3m', label: '3М' },
  { value: '6m', label: '6М' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё' }
]

// Плановое ТО: что наступит раньше
export const SERVICE_INTERVAL_KM = 5500
export const SERVICE_INTERVAL_MONTHS = 12
export const SERVICE_WARNING_SHARE = 0.9

// Интервал между заправками длиннее — скорее ошибка ввода, чем реальный пробег
export const MAX_FUEL_INTERVAL_KM = 2000
export const MIN_CONSUMPTION_INTERVALS = 3

// Больше месяцев в периоде — столбцы по кварталам
export const MAX_MONTH_BUCKETS = 24

export const UNDO_DURATION_MS = 5000

export const EMPTY_JOURNAL_FILTER: JournalFilter = { kind: 'all', range: null, group: null, query: '' }
