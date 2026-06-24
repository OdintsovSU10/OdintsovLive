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

export function formatRuPhone(value: string | null | undefined, options?: { dash?: boolean }): string {
  const raw = (value || '').trim()
  if (!raw) {
    return options?.dash ? '—' : ''
  }

  const digits = raw.replace(/\D/g, '')
  let normalized = digits

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    normalized = digits.slice(1)
  }

  if (normalized.length !== 10) {
    return raw
  }

  const part1 = normalized.slice(0, 3)
  const part2 = normalized.slice(3, 6)
  const part3 = normalized.slice(6, 8)
  const part4 = normalized.slice(8, 10)
  return `+7 (${part1}) ${part2} ${part3}-${part4}`
}
