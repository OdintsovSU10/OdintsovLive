export { formatRub, formatAxisTick } from '../../../components/charts/chartUtils'
export { formatMileage } from '../../../lib/formatUtils'

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// plural(5, ['запись', 'записи', 'записей']) → «записей»
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

// Компактно для оси пробега: 73,8к
export function formatKmTick(value: number): string {
  if (Math.abs(value) < 1000) return formatNumber(value)
  return `${formatNumber(value / 1000, Math.abs(value) >= 100000 ? 0 : 1)}к`
}

export function formatL100(value: number): string {
  return `${formatNumber(value, 1)} л/100 км`
}
