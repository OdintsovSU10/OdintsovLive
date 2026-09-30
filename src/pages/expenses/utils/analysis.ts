import type {
  ExpenseInsights,
  ExpenseTransaction,
  FindingInsight,
  FindingKind,
  HabitInsight,
  LargePurchaseInsight,
  SpendGroupInsight,
  SubscriptionInsight,
  SubscriptionPeriod
} from '../types'

type Tx = Pick<
  ExpenseTransaction,
  | 'id'
  | 'operation_at'
  | 'operation_date'
  | 'status'
  | 'payment_amount'
  | 'bank_category'
  | 'mcc'
  | 'description'
  | 'round_up_amount'
  | 'flow_direction'
  | 'include_in_analytics'
>

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_DAYS = 30.4
const WINDOW_DAYS = 180

const INTERNAL_TRANSFER_RE = /между своими счетами|себе в другой банк|себе из другого банка|кубышк|инвесткопилк/i
const TRANSFER_CATEGORY = 'Переводы'

const SUBSCRIPTION_CATEGORIES = new Set(['Мобильная связь', 'Связь', 'Цифровые товары', 'Сервис', 'Экосистема Яндекс'])
const SUBSCRIPTION_MCC = new Set(['4814', '4816', '4899', '5734', '5815', '5816', '5817', '5818', '7372'])
const SUBSCRIPTION_TEXT_RE = /подписк|subscription|\bpro\b|\bplus\b|плюс|premium|премиум/i

const SUBSCRIPTION_MIN_SHARE = 0.6
const MICRO_LIMIT = 50
const MICRO_CATEGORIES = new Set([...SUBSCRIPTION_CATEGORIES, 'Другое', 'Финансы', 'Различные услуги'])
const INTERMEDIARY_MCC = new Set(['5815', '5816', '5817', '5818', '6051', '6540', '7399'])
const INTERMEDIARY_RE = /onlipay|cloudpay|robokassa|yoomoney|юmoney|qiwi|xsolla|paypal|unitpay|payanyway|webverta/i
const TIPS_RE = /нетмонет|netmonet|чаев|\btips\b/i
const INSURANCE_MCC = new Set(['6300', '6381'])
const INSURANCE_RE = /страхов|комисси|обслуживани|смс-информ|sms-инфо|оповещени/i
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000

// Необязательные траты: первая совпавшая группа выигрывает
const DISCRETIONARY_GROUPS: Array<{ key: string; name: string; test: (t: Tx, text: string) => boolean }> = [
  {
    key: 'delivery',
    name: 'Доставка еды и продуктов',
    test: (_t, text) => /яндекс еда|яндекс лавка|самокат|купер|kuper|delivery|деливери|сбермаркет/.test(text)
  },
  {
    key: 'alcohol',
    name: 'Алкоголь',
    test: (t, text) => t.mcc === '5921' || /красное и белое|бристоль|винлаб|ароматный мир|пивко/.test(text)
  },
  {
    key: 'food-out',
    name: 'Фастфуд, кафе, рестораны',
    test: t => t.bank_category === 'Фастфуд' || t.bank_category === 'Рестораны' || ['5812', '5813', '5814'].includes(t.mcc || '')
  },
  { key: 'taxi', name: 'Такси', test: t => t.bank_category === 'Такси' || t.mcc === '4121' },
  { key: 'marketplaces', name: 'Маркетплейсы', test: t => t.bank_category === 'Маркетплейсы' },
  { key: 'flowers', name: 'Цветы', test: t => t.bank_category === 'Цветы' || t.mcc === '5992' }
]

const HABIT_MIN_COUNT = 10
const HABIT_MAX_CHECK = 1500
const LARGE_MIN_AMOUNT = 10000
const LARGE_MEDIAN_RATIO = 3
const LARGE_MEDIAN_MIN_ITEMS = 5
const DISCRETIONARY_CUT = 0.5

export function isInternalTransfer(t: Pick<Tx, 'description' | 'include_in_analytics'>): boolean {
  return t.include_in_analytics === false || INTERNAL_TRANSFER_RE.test(t.description || '')
}

export function isFailed(t: Pick<Tx, 'status'>): boolean {
  return Boolean(t.status) && t.status !== 'Ок' && t.status !== 'OK'
}

/** Операция участвует в доходах/расходах: успешна и не перевод между своими счетами */
export function isCountable(t: Pick<Tx, 'status' | 'description' | 'include_in_analytics'>): boolean {
  return !isFailed(t) && !isInternalTransfer(t)
}

export function merchantKey(description: string | null): string {
  return (description || '')
    .toLowerCase()
    .replace(/[_\s-]*sbp$/i, '')
    .replace(/["«»'.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

function timestampMs(operationAt: string): number {
  const match = operationAt.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return Number.NaN
  const [, y, m, d, hh, mm, ss] = match
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || 0))
}

function isoFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  return date.toISOString().slice(0, 10)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0)
}

function spent(t: Tx): number {
  return Math.abs(t.payment_amount)
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

function clusterByAmount(items: Tx[]): Tx[][] {
  const clusters: Array<{ ref: number; items: Tx[] }> = []
  for (const item of [...items].sort((a, b) => spent(a) - spent(b))) {
    const cluster = clusters.find(c => Math.abs(spent(item) - c.ref) <= c.ref * 0.15)
    if (cluster) cluster.items.push(item)
    else clusters.push({ ref: spent(item), items: [item] })
  }
  return clusters.map(c => c.items)
}

function detectPeriod(days: number[]): SubscriptionPeriod {
  const intervals = days.slice(1).map((day, i) => day - days[i])
  if (intervals.length === 0) return 'irregular'
  if (intervals.every(gap => gap >= 6 && gap <= 8)) return 'weekly'
  const monthly = intervals.every(gap => {
    const k = Math.round(gap / MONTH_DAYS)
    return k >= 1 && k <= 2 && Math.abs(gap - k * MONTH_DAYS) <= 7
  })
  if (monthly) return 'monthly'
  if (intervals.every(gap => gap >= 84 && gap <= 98)) return 'quarterly'
  return 'irregular'
}

function hasSubscriptionMarker(t: Tx): boolean {
  return (
    SUBSCRIPTION_CATEGORIES.has(t.bank_category || '') ||
    SUBSCRIPTION_MCC.has(t.mcc || '') ||
    SUBSCRIPTION_TEXT_RE.test(t.description || '')
  )
}

function mostFrequentDescription(items: Tx[]): string | null {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.description) counts.set(item.description, (counts.get(item.description) || 0) + 1)
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

function findSubscriptions(purchases: Tx[], months: number, anchorDay: number): SubscriptionInsight[] {
  const result: SubscriptionInsight[] = []

  for (const [key, items] of groupBy(purchases, t => merchantKey(t.description))) {
    if (!key) continue
    // Магазин с разными чеками — не подписка: регулярная сумма должна быть основной у мерчанта
    const regularItems = items.filter(t => spent(t) >= MICRO_LIMIT)

    for (const cluster of clusterByAmount(regularItems)) {
      const amounts = cluster.map(spent)
      const amount = median(amounts)
      if (cluster.length < 2 || cluster.length / months > 4) continue
      if (cluster.length / regularItems.length < SUBSCRIPTION_MIN_SHARE) continue

      const sorted = [...cluster].sort((a, b) => a.operation_at.localeCompare(b.operation_at))
      const days = sorted.map(t => dayNumber(t.operation_date))
      const period = detectPeriod(days)
      const hasMarker = sorted.some(hasSubscriptionMarker)
      if (!hasMarker && (period === 'irregular' || cluster.length < 3)) continue

      const last = sorted[sorted.length - 1]
      const lastDay = days[days.length - 1]
      const cycleDays = period === 'weekly' ? 7 : period === 'quarterly' ? 91 : period === 'monthly' ? MONTH_DAYS : (lastDay - days[0]) / (days.length - 1)
      const active = anchorDay - lastDay <= cycleDays * 1.5 + 5

      const monthlyCost =
        period === 'weekly' ? (amount * 52) / 12
          : period === 'monthly' ? amount
            : period === 'quarterly' ? amount / 3
              : sum(amounts) / months

      const nextDate =
        period === 'weekly' ? isoFromDayNumber(lastDay + 7)
          : period === 'monthly' ? addMonths(last.operation_date, 1)
            : period === 'quarterly' ? addMonths(last.operation_date, 3)
              : null

      result.push({
        key: `${key}:${Math.round(amount)}`,
        name: mostFrequentDescription(sorted) || key,
        category: last.bank_category,
        amount,
        count: cluster.length,
        period,
        lastDate: last.operation_date,
        nextDate,
        active,
        monthlyCost,
        yearlyCost: monthlyCost * 12
      })
    }
  }

  return result.sort((a, b) => Number(b.active) - Number(a.active) || b.monthlyCost - a.monthlyCost)
}

function classifyFinding(t: Tx): FindingKind | null {
  const text = t.description || ''
  if (TIPS_RE.test(text)) return 'tips'
  if (INSURANCE_MCC.has(t.mcc || '') || INSURANCE_RE.test(text)) return 'insurance'
  if (INTERMEDIARY_MCC.has(t.mcc || '') || INTERMEDIARY_RE.test(text)) return 'intermediary'
  if (spent(t) < MICRO_LIMIT && (!t.bank_category || MICRO_CATEGORIES.has(t.bank_category))) return 'micro'
  return null
}

function findDuplicates(purchases: Tx[]): Tx[] {
  const duplicates: Tx[] = []
  const sorted = [...purchases].sort((a, b) => a.operation_at.localeCompare(b.operation_at))

  sorted.forEach((current, index) => {
    const currentMs = timestampMs(current.operation_at)
    for (let j = index - 1; j >= 0; j--) {
      const previous = sorted[j]
      if (currentMs - timestampMs(previous.operation_at) > DUPLICATE_WINDOW_MS) break
      if (previous.payment_amount === current.payment_amount && previous.description === current.description) {
        duplicates.push(current)
        break
      }
    }
  })

  return duplicates
}

function toFindings(kind: FindingKind, items: Tx[]): FindingInsight[] {
  return Array.from(groupBy(items, t => merchantKey(t.description)).entries()).map(([key, group]) => {
    const dates = group.map(t => t.operation_date).sort()
    return {
      key: `${kind}:${key}`,
      kind,
      name: group[0].description || 'Без описания',
      total: sum(group.map(spent)),
      count: group.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1]
    }
  })
}

function findDiscretionary(purchases: Tx[], purchasesTotal: number, months: number): SpendGroupInsight[] {
  const buckets = new Map<string, Tx[]>()

  for (const t of purchases) {
    const text = (t.description || '').toLowerCase()
    const group = DISCRETIONARY_GROUPS.find(g => g.test(t, text))
    if (!group) continue
    const list = buckets.get(group.key)
    if (list) list.push(t)
    else buckets.set(group.key, [t])
  }

  return DISCRETIONARY_GROUPS
    .filter(group => buckets.has(group.key))
    .map(group => {
      const items = buckets.get(group.key) || []
      const total = sum(items.map(spent))
      return {
        key: group.key,
        name: group.name,
        total,
        count: items.length,
        avgCheck: total / items.length,
        monthly: total / months,
        share: purchasesTotal > 0 ? total / purchasesTotal : 0
      }
    })
    .sort((a, b) => b.total - a.total)
}

function findHabits(purchases: Tx[], days: number, months: number, skipKeys: Set<string>): HabitInsight[] {
  return Array.from(groupBy(purchases, t => merchantKey(t.description)).entries())
    .map(([key, items]) => {
      const total = sum(items.map(spent))
      return {
        key,
        name: items[0].description || key,
        category: items[0].bank_category,
        total,
        count: items.length,
        avgCheck: total / items.length,
        perWeek: items.length / (days / 7),
        monthly: total / months
      }
    })
    .filter(habit => habit.key && !skipKeys.has(habit.key) && habit.count >= HABIT_MIN_COUNT && habit.avgCheck < HABIT_MAX_CHECK)
    .sort((a, b) => b.total - a.total)
}

function findLargePurchases(purchases: Tx[]): LargePurchaseInsight[] {
  const medians = new Map<string, number>()
  for (const [category, items] of groupBy(purchases, t => t.bank_category || '')) {
    if (items.length >= LARGE_MEDIAN_MIN_ITEMS) medians.set(category, median(items.map(spent)))
  }

  return purchases
    .filter(t => spent(t) >= Math.max(LARGE_MIN_AMOUNT, (medians.get(t.bank_category || '') || 0) * LARGE_MEDIAN_RATIO))
    .map(t => ({
      id: t.id,
      name: t.description || 'Без описания',
      category: t.bank_category,
      amount: spent(t),
      date: t.operation_date
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function buildInsights(transactions: Tx[]): ExpenseInsights | null {
  if (transactions.length === 0) return null

  const dates = transactions.map(t => t.operation_date).sort()
  const windowTo = dates[dates.length - 1]
  const anchorDay = dayNumber(windowTo)
  const windowFrom = [isoFromDayNumber(anchorDay - WINDOW_DAYS + 1), dates[0]].sort()[1]
  const inWindow = transactions.filter(t => t.operation_date >= windowFrom)

  const days = anchorDay - dayNumber(windowFrom) + 1
  const months = Math.max(1, days / MONTH_DAYS)

  const purchases = inWindow.filter(
    t => t.flow_direction === 'out' && isCountable(t) && t.bank_category !== TRANSFER_CATEGORY
  )
  const purchasesTotal = sum(purchases.map(spent))

  const subscriptions = findSubscriptions(purchases, months, anchorDay)
  const subscriptionKeys = new Set(subscriptions.map(s => merchantKey(s.name)))

  const duplicates = findDuplicates(purchases)
  const byKind = new Map<FindingKind, Tx[]>()
  for (const t of purchases) {
    const kind = classifyFinding(t)
    if (!kind || (kind !== 'micro' && subscriptionKeys.has(merchantKey(t.description)))) continue
    byKind.set(kind, [...(byKind.get(kind) || []), t])
  }
  const failed = inWindow.filter(t => t.flow_direction === 'out' && isFailed(t))

  const findings = [
    ...toFindings('duplicate', duplicates),
    ...toFindings('micro', byKind.get('micro') || []),
    ...toFindings('intermediary', byKind.get('intermediary') || []),
    ...toFindings('tips', byKind.get('tips') || []),
    ...toFindings('insurance', byKind.get('insurance') || []),
    ...toFindings('failed', failed)
  ]

  // Экономия: дубли, микросписания, посредники, чаевые (каждая операция — один раз)
  const suspiciousIds = new Set<string>([
    ...duplicates.map(t => t.id),
    ...(['micro', 'intermediary', 'tips'] as FindingKind[]).flatMap(kind => (byKind.get(kind) || []).map(t => t.id))
  ])
  const suspiciousTotal = sum(purchases.filter(t => suspiciousIds.has(t.id)).map(spent))

  const discretionary = findDiscretionary(purchases, purchasesTotal, months)
  const discretionaryMonthly = sum(discretionary.map(group => group.monthly))
  const suspiciousMonthly = suspiciousTotal / months

  return {
    windowFrom,
    windowTo,
    months,
    purchasesTotal,
    purchasesMonthly: purchasesTotal / months,
    subscriptions,
    subscriptionsMonthly: sum(subscriptions.filter(s => s.active).map(s => s.monthlyCost)),
    findings,
    suspiciousTotal,
    suspiciousMonthly,
    discretionary,
    discretionaryMonthly,
    habits: findHabits(purchases, days, months, subscriptionKeys),
    largePurchases: findLargePurchases(purchases),
    roundUpTotal: sum(inWindow.filter(t => t.flow_direction === 'out' && !isFailed(t)).map(t => t.round_up_amount || 0)),
    internalCount: inWindow.filter(t => !isFailed(t) && isInternalTransfer(t)).length,
    failedCount: inWindow.filter(isFailed).length,
    potentialMonthlySavings: discretionaryMonthly * DISCRETIONARY_CUT + suspiciousMonthly
  }
}

export const SAVINGS_CUT_PERCENT = DISCRETIONARY_CUT * 100
