export const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }
export const GRID_STROKE = 'var(--border)'
export const DIMMED_OPACITY = 0.3

export function formatAmount(value: number, digits = 0): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function formatRub(value: number, digits = 0): string {
  return `${formatAmount(value, digits)} ₽`
}

// Компактные подписи оси: 950, 12 тыс., 1,2 млн
export function formatAxisTick(value: number | string | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Math.abs(numeric) < 1000) return formatAmount(numeric)

  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  }).format(numeric)
}
