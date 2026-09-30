export interface ElectricityMeter {
  name: string
  value: number
}

export interface RecognizedMeter {
  kind: 'electricity' | 'water'
  tariff: 'T1' | 'T2' | 'T3' | null
  value: number
}

export interface WaterTariffs {
  cold: number
  hot: number
  drainage: number
}

export interface WaterReadings {
  cold: number
  hot: number
}

export interface WaterBill {
  prevCold: number
  curCold: number
  coldUsage: number
  coldSum: number
  prevHot: number
  curHot: number
  hotUsage: number
  hotSum: number
  drainageUsage: number
  drainageSum: number
  total: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

export const resizeImage = (file: File, maxSide = 1280, quality = 0.85): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas недоступен'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось открыть фото'))
    }
    img.src = url
  })

// Водомеры одинаковые, поэтому ХВС/ГВС определяем по прошлому месяцу:
// показания не убывают, иначе — по положению (слева ХВС, справа ГВС)
export const assignWaterReadings = (
  values: number[],
  prev: WaterReadings | null
): Partial<WaterReadings> => {
  const readings = values.map(v => Math.floor(v))
  if (readings.length === 0) return {}

  if (readings.length === 1) {
    const [value] = readings
    if (!prev) return { cold: value }
    const coldDelta = value - Math.floor(prev.cold)
    const hotDelta = value - Math.floor(prev.hot)
    if (coldDelta >= 0 && (hotDelta < 0 || coldDelta <= hotDelta)) return { cold: value }
    if (hotDelta >= 0) return { hot: value }
    return { cold: value }
  }

  const [left, right] = readings
  if (prev) {
    const prevCold = Math.floor(prev.cold)
    const prevHot = Math.floor(prev.hot)
    const direct = left >= prevCold && right >= prevHot
    const swapped = right >= prevCold && left >= prevHot
    if (swapped && !direct) return { cold: right, hot: left }
  }
  return { cold: left, hot: right }
}

export const applyElectricity = (
  meters: ElectricityMeter[],
  recognized: RecognizedMeter[]
): ElectricityMeter[] => {
  let result = meters
  for (const r of recognized) {
    if (r.kind !== 'electricity' || !r.tariff) continue
    const name = r.tariff
    result = result.some(m => m.name === name)
      ? result.map(m => (m.name === name ? { ...m, value: r.value } : m))
      : [...result, { name, value: r.value }].sort((a, b) => a.name.localeCompare(b.name))
  }
  return result
}

export const calcWaterBill = (
  prev: WaterReadings | null,
  cur: WaterReadings,
  tariffs: WaterTariffs
): WaterBill | null => {
  if (!prev || cur.cold <= 0 || cur.hot <= 0) return null
  const prevCold = Math.floor(prev.cold)
  const curCold = Math.floor(cur.cold)
  const prevHot = Math.floor(prev.hot)
  const curHot = Math.floor(cur.hot)
  const coldUsage = Math.max(0, curCold - prevCold)
  const hotUsage = Math.max(0, curHot - prevHot)
  const drainageUsage = coldUsage + hotUsage
  const coldSum = round2(coldUsage * tariffs.cold)
  const hotSum = round2(hotUsage * tariffs.hot)
  const drainageSum = round2(drainageUsage * tariffs.drainage)
  return {
    prevCold,
    curCold,
    coldUsage,
    coldSum,
    prevHot,
    curHot,
    hotUsage,
    hotSum,
    drainageUsage,
    drainageSum,
    total: round2(coldSum + hotSum + drainageSum)
  }
}

export const hasAllTariffs = (tariffs: WaterTariffs) =>
  tariffs.cold > 0 && tariffs.hot > 0 && tariffs.drainage > 0

const money = (value: number, grouping = true) =>
  value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: grouping })

export const buildRentMessage = (
  electricity: ElectricityMeter[],
  bill: WaterBill | null,
  tariffs: WaterTariffs
): string => {
  const lines = ['Привет.']
  electricity.forEach(m => lines.push(`${m.name} ${money(m.value)}`))

  if (bill) {
    lines.push(
      '',
      `ХВС: Было ${bill.prevCold}, стало ${bill.curCold} (${bill.coldUsage}). ${bill.coldUsage}*${money(tariffs.cold)}=${money(bill.coldSum)}`,
      `ГВС: Было ${bill.prevHot}, стало ${bill.curHot} (${bill.hotUsage}). ${bill.hotUsage}*${money(tariffs.hot)}=${money(bill.hotSum)}`,
      `Водоотведение: ${bill.coldUsage}+${bill.hotUsage}=${bill.drainageUsage}. ${bill.drainageUsage}*${money(tariffs.drainage)}=${money(bill.drainageSum)}`,
      `Итого за воду: ${money(bill.coldSum, false)}+${money(bill.hotSum, false)}+${money(bill.drainageSum, false)}=${money(bill.total)}`
    )
  }

  return lines.join('\n')
}
