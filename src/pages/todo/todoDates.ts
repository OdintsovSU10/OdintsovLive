import type { TodoItem } from './types'

const TIME_ZONE = 'Europe/Moscow'
const DAY_MS = 24 * 60 * 60 * 1000

// Сегодня по Москве, YYYY-MM-DD (en-CA отдаёт именно такой формат)
export function getMoscowToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function toUtcDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function daysFromToday(iso: string, today: string): number {
  return Math.round((toUtcDate(iso).getTime() - toUtcDate(today).getTime()) / DAY_MS)
}

// «сегодня», «завтра», «вчера», «12 нояб.», для другого года — «12 нояб. 2027»
export function formatDueLabel(iso: string, today: string): string {
  const diff = daysFromToday(iso, today)
  if (diff === 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff === -1) return 'вчера'

  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return toUtcDate(iso).toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  }).replace(' г.', '')
}

export function isOverdue(item: TodoItem, today: string): boolean {
  return item.due_date !== null && item.due_date < today
}

// Просроченные и с датой — по возрастанию срока, затем без даты по времени создания
export function sortOpen(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date && !b.due_date) return -1
    if (!a.due_date && b.due_date) return 1
    return a.created_at.localeCompare(b.created_at)
  })
}
