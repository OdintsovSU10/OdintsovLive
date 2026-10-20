// Траты по правилам портала и бюджет «от зарплаты до зарплаты». Выборку трат используют и ответы бота
// на вопросы (reads.mjs), и напоминания.
import { merchantKey } from './merchants.mjs'

const PAGE = 1000
const MAX_PAGES = 100
const DAY_MS = 24 * 60 * 60 * 1000
// Как isInternalTransfer в src/pages/expenses/utils/analysis.ts
const INTERNAL_TRANSFER_RE = /между своими счетами|себе в другой банк|себе из другого банка|кубышк|инвесткопилк/i

export const round2 = n => Math.round(n * 100) / 100

export const addDays = (date, days) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10)

const isFailed = row => Boolean(row.status) && row.status !== 'Ок' && row.status !== 'OK'
const isInternalTransfer = row => row.include_in_analytics === false || INTERNAL_TRANSFER_RE.test(row.description || '')
const isCountable = row => !isFailed(row) && !isInternalTransfer(row)

// PostgREST отдаёт не больше 1000 строк за запрос — читаем страницами
export const fetchAll = async (rest, route) => {
  const rows = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const chunk = await rest(`${route}&limit=${PAGE}&offset=${page * PAGE}`)
    rows.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return rows
}

export const loadCategoryNames = async (rest, userId) => {
  const rows = await rest(`expense_user_categories?user_id=eq.${userId}&select=id,name&limit=1000`)
  return new Map(rows.map(c => [c.id, c.name]))
}

// Операции за период [from, toExclusive): успешные, не переводы между своими счетами.
// Категория — из правила мерчанта, иначе из маппинга банковской категории; название — из правила, иначе описание
export const loadOperations = async (rest, userId, from, toExclusive) => {
  const [rows, rules] = await Promise.all([
    fetchAll(rest, `expense_transactions?user_id=eq.${userId}&flow_direction=in.(in,out)&operation_date=gte.${from}&operation_date=lt.${toExclusive}&select=id,operation_date,status,payment_amount,description,include_in_analytics,flow_direction,mapped_category_id,note&order=operation_date.asc,id.asc`),
    fetchAll(rest, `expense_merchant_rules?user_id=eq.${userId}&select=merchant_key,display_name,category_id&order=id.asc`)
  ])
  const ruleByKey = new Map(rules.map(r => [r.merchant_key, r]))

  return rows.filter(isCountable).map(row => {
    const rule = ruleByKey.get(merchantKey(row.description))
    return {
      date: row.operation_date,
      direction: row.flow_direction,
      amount: Math.abs(Number(row.payment_amount) || 0),
      categoryId: rule?.category_id ?? row.mapped_category_id ?? null,
      merchant: rule?.display_name || row.description || 'Без описания',
      description: row.description || '',
      note: row.note || null
    }
  })
}

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

// День зарплаты в месяце (month 1..12, может выйти за 1..12 — год сдвигается); в коротком месяце — последний день
const paydayIn = (year, month, payday) => {
  const shifted = new Date(Date.UTC(year, month - 1, 1))
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth() + 1
  const day = String(Math.min(payday, daysInMonth(y, m))).padStart(2, '0')
  return `${y}-${String(m).padStart(2, '0')}-${day}`
}

// Период бюджета: start — последняя зарплата ≤ today, next — следующая после неё
export const budgetPeriod = (today, payday) => {
  const [year, month] = today.split('-').map(Number)
  const thisMonth = paydayIn(year, month, payday)
  const start = thisMonth <= today ? thisMonth : paydayIn(year, month - 1, payday)
  const [startYear, startMonth] = start.split('-').map(Number)
  const next = paydayIn(startYear, startMonth + 1, payday)
  const daysLeft = Math.max(1, Math.round((Date.parse(next) - Date.parse(today)) / DAY_MS))
  return { start, next, daysLeft }
}

export const budgetStatus = async (rest, userId, today) => {
  const [budgets, [settings], categoryNames] = await Promise.all([
    rest(`expense_budgets?user_id=eq.${userId}&select=category_id,monthly_limit`),
    rest(`expense_budget_settings?user_id=eq.${userId}&select=payday`),
    loadCategoryNames(rest, userId)
  ])
  if (budgets.length === 0) return { configured: false }

  const { start, next, daysLeft } = budgetPeriod(today, Number(settings?.payday) || 1)
  const spentByCategory = new Map()
  for (const op of await loadOperations(rest, userId, start, next)) {
    if (op.direction !== 'out' || !op.categoryId) continue
    spentByCategory.set(op.categoryId, (spentByCategory.get(op.categoryId) || 0) + op.amount)
  }

  const categories = budgets.map(b => {
    const limit = Number(b.monthly_limit)
    const spent = spentByCategory.get(b.category_id) || 0
    return {
      category_id: b.category_id,
      name: categoryNames.get(b.category_id) || 'Без названия',
      limit: round2(limit),
      spent: round2(spent),
      left: round2(limit - spent),
      share: limit > 0 ? Math.round((spent / limit) * 100) / 100 : 0
    }
  }).sort((a, b) => b.share - a.share)

  const totalLimit = round2(categories.reduce((sum, c) => sum + c.limit, 0))
  const totalSpent = round2(categories.reduce((sum, c) => sum + c.spent, 0))
  return {
    configured: true,
    start,
    next,
    daysLeft,
    categories,
    totalLimit,
    totalSpent,
    allowancePerDay: Math.floor(Math.max(0, totalLimit - totalSpent) / daysLeft)
  }
}
