const TIME_ZONE = 'Europe/Moscow'

export type NewsPeriod = 'today' | 'yesterday' | 'week' | 'month'

const getMoscowToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// Москва без перехода на летнее время: UTC+3
const moscowMidnight = (daysAgo: number): string => {
  const [year, month, day] = getMoscowToday().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - daysAgo) - 3 * 60 * 60 * 1000).toISOString()
}

// Границы периода: from включительно, to исключительно (null — без верхней границы)
export const getPeriodRange = (period: NewsPeriod): { from: string; to: string | null } => {
  if (period === 'today') return { from: moscowMidnight(0), to: null }
  if (period === 'yesterday') return { from: moscowMidnight(1), to: moscowMidnight(0) }
  if (period === 'week') return { from: moscowMidnight(6), to: null }
  return { from: moscowMidnight(29), to: null }
}

export const formatPostDate = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })

const plural = (n: number, one: string, few: string, many: string): string => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export const formatRelative = (iso: string | null): string => {
  if (!iso) return 'ещё не проверялся'
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`
  const days = Math.floor(hours / 24)
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`
}
