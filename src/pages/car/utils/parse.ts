// Число из поля ввода: пробелы и запятая допустимы, пусто — null
export function parseDecimal(value: string): number | null {
  const cleaned = value.replace(/\s/g, '').replace(',', '.')
  if (!cleaned) return null
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : null
}

// Дробь в поле — с запятой, как привычно в ru-RU
export function toInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',')
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
