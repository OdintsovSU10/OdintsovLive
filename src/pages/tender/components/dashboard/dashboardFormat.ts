export const formatNumber = (value: number): string => Math.round(value).toLocaleString('ru-RU')

export const formatRub = (value: number): string => `${formatNumber(value)} ₽`

export const formatSigned = (value: number): string => {
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('ru-RU')}`
}

export const formatSignedRub = (value: number): string => `${formatSigned(value)} ₽`

export const formatHours = (value: number): string => (
  Number.isInteger(value)
    ? value.toLocaleString('ru-RU')
    : value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
)

export const formatSignedHours = (value: number): string => {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) return '0'
  return `${rounded > 0 ? '+' : '−'}${formatHours(Math.abs(rounded))}`
}

export const formatPercent = (value: number): string => `${Math.round(value)}%`

export const formatSignedPercent = (value: number): string => {
  const rounded = Math.round(value)
  if (rounded === 0) return '0%'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`
}

// Короткая сумма: «2,1 млн», «850 тыс», «320»
export const formatShortMoney = (value: number): string => {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} млн`
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} тыс`
  }
  return `${sign}${Math.round(abs).toLocaleString('ru-RU')}`
}

// Только число в млн для пары «факт / план»: «2,1»
export const formatMillions = (value: number): string => (
  (value / 1_000_000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
)

export const getPercentOf = (part: number, total: number): number => (
  total > 0 ? (part / total) * 100 : 0
)

export const pluralize = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
