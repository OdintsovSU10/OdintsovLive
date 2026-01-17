export function formatMoney(amount: number | null | undefined, options?: { dash?: boolean }): string {
  if (!amount && options?.dash) return '—'
  return Math.round(amount || 0).toLocaleString('ru-RU') + ' ₽'
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ru-RU').format(num)
}

export function formatMileage(km: number): string {
  return new Intl.NumberFormat('ru-RU').format(km) + ' км'
}

export function parseNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

export function formatNumberInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
