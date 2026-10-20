// Инструменты чтения: нейронка вызывает get_*, бот отдаёт ей данные из базы, и она отвечает на вопрос.
// Обработчик — (rest, ctx, args) → объект; результат уходит в модель как JSON.
import { BODY_PARAM_FIELDS, ENGINE_OIL_KEY, UserError } from './actions.mjs'
import { addDays, budgetStatus, loadCategoryNames, loadOperations, round2 } from './budget.mjs'

// Те же интервалы ТО, что на сайте (src/pages/car/constants.ts)
const SERVICE_INTERVAL_KM = 5500
const SERVICE_INTERVAL_MONTHS = 12
const RESULT_MAX_CHARS = 6000
const GROUPS_LIMIT = 15
const OPERATIONS_LIMIT = 30
const WEIGHT_POINTS_MAX = 60
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const GROUP_BY = ['category', 'merchant', 'day', 'none']

const fn = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
})

const normalize = value => (value || '').trim().replace(/\s+/g, ' ').toLowerCase()

const clampInt = (value, fallback, min, max) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export const buildReadTools = () => [
  fn('get_expenses', 'Траты и доходы за период: сумма, число операций, группировка. Для вопросов «сколько потратил на …». Переводы между своими счетами не считаются.', {
    from: { type: 'string', description: 'Начало периода включительно, YYYY-MM-DD' },
    to: { type: 'string', description: 'Конец периода включительно, YYYY-MM-DD' },
    category: { type: 'string', description: 'Категория пользователя из списка, если траты нужны только по ней' },
    merchant: { type: 'string', description: 'Часть названия магазина или получателя, если нужны траты только там' },
    group_by: { type: 'string', enum: GROUP_BY, description: 'category — по категориям, merchant — по магазинам, day — по дням, none — список операций' }
  }, ['from', 'to', 'group_by']),
  fn('get_budget', 'Бюджет: лимиты по категориям, сколько потрачено в текущем календарном месяце, сколько можно тратить в день.', {}, []),
  fn('get_car', 'Машины: пробег, сроки ОСАГО и КАСКО, последние заправки, когда ТО (масло), траты на машину за 30 дней.', {}, []),
  fn('get_weight', 'Вес тела за период и последние замеры.', {
    days: { type: 'integer', description: 'За сколько последних дней, по умолчанию 90' }
  }, []),
  fn('get_rent', 'Аренда по месяцам: аренда, коммуналка, итог, оплачено ли.', {
    months: { type: 'integer', description: 'Сколько последних месяцев, по умолчанию 6' }
  }, []),
  fn('get_tasks', 'Список дел: открытые со сроком и признаком просрочки; по просьбе — ещё последние сделанные.', {
    include_done: { type: 'boolean', description: 'Добавить 10 последних сделанных дел' }
  }, [])
]

const getExpenses = async (rest, ctx, args) => {
  const { from, to, category, merchant } = args
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '') || from > to) {
    return { error: 'Нужны даты from и to в формате YYYY-MM-DD, from не позже to' }
  }
  const groupBy = GROUP_BY.includes(args.group_by) ? args.group_by : 'category'
  const categoryNames = await loadCategoryNames(rest, ctx.userId)

  let categoryId = null
  if (category?.trim()) {
    const wanted = normalize(category)
    const entries = [...categoryNames.entries()]
    const found = entries.find(([, name]) => normalize(name) === wanted)
      || (entries.filter(([, name]) => normalize(name).includes(wanted)).length === 1
        ? entries.find(([, name]) => normalize(name).includes(wanted))
        : null)
    if (!found) return { error: `Нет категории «${category}»`, categories: ctx.categories }
    categoryId = found[0]
  }
  const merchantPart = normalize(merchant)

  const operations = await loadOperations(rest, ctx.userId, from, addDays(to, 1))
  const incomeTotal = operations.filter(op => op.direction === 'in').reduce((sum, op) => sum + op.amount, 0)
  const spent = operations.filter(op => op.direction === 'out'
    && (!categoryId || op.categoryId === categoryId)
    && (!merchantPart || normalize(op.merchant).includes(merchantPart) || normalize(op.description).includes(merchantPart)))
  const categoryOf = op => categoryNames.get(op.categoryId) || 'Без категории'

  const result = {
    from,
    to,
    spent_total: round2(spent.reduce((sum, op) => sum + op.amount, 0)),
    count: spent.length,
    income_total: round2(incomeTotal)
  }

  if (groupBy === 'none') {
    result.operations = [...spent].sort((a, b) => b.date.localeCompare(a.date)).slice(0, OPERATIONS_LIMIT).map(op => ({
      date: op.date, merchant: op.merchant, amount: round2(op.amount), category: categoryOf(op), note: op.note
    }))
    return result
  }

  const keyOf = { category: categoryOf, merchant: op => op.merchant, day: op => op.date }[groupBy]
  const groups = new Map()
  for (const op of spent) {
    const key = keyOf(op)
    const group = groups.get(key) || { name: key, sum: 0, count: 0 }
    group.sum += op.amount
    group.count += 1
    groups.set(key, group)
  }
  const sorted = [...groups.values()].sort((a, b) => b.sum - a.sum)
  result.groups_total = sorted.length
  result.groups = sorted.slice(0, GROUPS_LIMIT).map(g => ({ ...g, sum: round2(g.sum) }))
  return result
}

const getBudget = (rest, ctx) => budgetStatus(rest, ctx.userId, ctx.today)

const monthsBetween = (from, to) => {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return (ty - fy) * 12 + tm - fm - (td < fd ? 1 : 0)
}

const sumBy = (rows, field) => round2(rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0))

const carReport = async (rest, ctx, car) => {
  const since = addDays(ctx.today, -30)
  const [fuel, [oil], expenses, recentFuel] = await Promise.all([
    rest(`car_fuel?car_id=eq.${car.id}&select=date,liters,total_cost,mileage&order=date.desc,created_at.desc&limit=3`),
    rest(`car_maintenance?car_id=eq.${car.id}&resets=cs.{${ENGINE_OIL_KEY}}&select=date,mileage,type&order=date.desc,mileage.desc.nullslast&limit=1`),
    rest(`car_expenses?car_id=eq.${car.id}&date=gte.${since}&select=cost&limit=1000`),
    rest(`car_fuel?car_id=eq.${car.id}&date=gte.${since}&select=total_cost&limit=1000`)
  ])

  const mileage = car.current_mileage || 0
  let service = null
  if (oil) {
    const kmSince = oil.mileage ? Math.max(0, mileage - oil.mileage) : null
    const monthsSince = Math.max(0, monthsBetween(oil.date, ctx.today))
    service = {
      date: oil.date,
      title: oil.type,
      mileage: oil.mileage,
      km_left: kmSince !== null ? SERVICE_INTERVAL_KM - kmSince : null,
      months_left: SERVICE_INTERVAL_MONTHS - monthsSince
    }
  }

  const fuelSum = sumBy(recentFuel, 'total_cost')
  const otherSum = sumBy(expenses, 'cost')
  return {
    label: `${car.brand} ${car.model}`.trim(),
    current_mileage: mileage,
    osago_until: car.osago_until || null,
    kasko_until: car.kasko_until || null,
    last_fuel: fuel.map(f => ({ date: f.date, liters: f.liters, total_cost: f.total_cost, mileage: f.mileage })),
    oil_service: service,
    spent_30d: { fuel: fuelSum, other: otherSum, total: round2(fuelSum + otherSum) }
  }
}

const getCar = async (rest, ctx) => {
  const cars = (await rest(`cars?user_id=eq.${ctx.userId}&select=id,brand,model,current_mileage,is_active,osago_until,kasko_until&order=created_at.desc`))
    .filter(c => c.is_active !== false)
  if (cars.length === 0) return { cars: [] }
  return { cars: await Promise.all(cars.map(car => carReport(rest, ctx, car))) }
}

// Не больше max точек, равномерно; первая и последняя остаются
const thin = (items, max) => {
  if (items.length <= max) return items
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))])
}

const getWeight = async (rest, ctx, args) => {
  const days = clampInt(args.days, 90, 1, 3650)
  const from = addDays(ctx.today, -days)
  const [rows, [params]] = await Promise.all([
    rest(`body_weight?user_id=eq.${ctx.userId}&date=gte.${from}&select=date,weight&order=date.asc&limit=5000`),
    rest(`body_params?user_id=eq.${ctx.userId}&select=date,${Object.keys(BODY_PARAM_FIELDS).join(',')}&order=date.desc&limit=1`)
  ])

  const lastParams = params
    ? Object.fromEntries(Object.entries(params).filter(([, value]) => value !== null))
    : null
  if (rows.length === 0) return { from, to: ctx.today, count: 0, last_params: lastParams }

  const weights = rows.map(r => Number(r.weight))
  const first = weights[0]
  const last = weights[weights.length - 1]
  return {
    from,
    to: ctx.today,
    count: rows.length,
    first,
    last,
    min: Math.min(...weights),
    max: Math.max(...weights),
    change: round2(last - first),
    points: thin(rows, WEIGHT_POINTS_MAX).map(r => ({ date: r.date, weight: Number(r.weight) })),
    last_params: lastParams
  }
}

const getRent = async (rest, ctx, args) => {
  const months = clampInt(args.months, 6, 1, 24)
  const [year, month] = ctx.today.split('-').map(Number)
  const rows = await rest(`rent_records?user_id=eq.${ctx.userId}&select=year,month,rent_amount,water_amount,electricity_amount,paid,notes&order=year.desc,month.desc&limit=${months + 12}`)
  // месяц в базе с нуля, будущие месяцы пропускаем
  const records = rows
    .filter(r => r.year < year || (r.year === year && r.month <= month - 1))
    .slice(0, months)
    .map(r => {
      const rent = Number(r.rent_amount) || 0
      const utilities = round2((Number(r.water_amount) || 0) + (Number(r.electricity_amount) || 0))
      return {
        year: r.year,
        month: MONTH_NAMES[r.month] || String(r.month),
        rent,
        utilities,
        total: round2(rent + utilities),
        paid: Boolean(r.paid),
        note: r.notes || null
      }
    })
  return { records }
}

const getTasks = async (rest, ctx, args) => {
  const [open, done] = await Promise.all([
    rest(`todo_items?user_id=eq.${ctx.userId}&done_at=is.null&select=title,due_date,source&order=due_date.asc.nullslast,created_at.asc&limit=100`),
    args.include_done
      ? rest(`todo_items?user_id=eq.${ctx.userId}&done_at=not.is.null&select=title,due_date,done_at&order=done_at.desc&limit=10`)
      : []
  ])
  const result = {
    open: open.map(t => ({ title: t.title, due_date: t.due_date, overdue: Boolean(t.due_date && t.due_date < ctx.today), source: t.source }))
  }
  if (args.include_done) result.done = done.map(t => ({ title: t.title, due_date: t.due_date, done_at: t.done_at }))
  return result
}

export const READ_HANDLERS = {
  get_expenses: getExpenses,
  get_budget: getBudget,
  get_car: getCar,
  get_weight: getWeight,
  get_rent: getRent,
  get_tasks: getTasks
}

export const isReadCall = call => call.name in READ_HANDLERS

const serialize = result => {
  const json = JSON.stringify(result)
  return json.length > RESULT_MAX_CHARS ? `${json.slice(0, RESULT_MAX_CHARS)}…[обрезано]` : json
}

// Выполняет вызовы чтения → строки для сообщений role:'tool'. Ошибка одного вызова не валит остальные
export const executeReads = (rest, ctx, calls) => Promise.all(calls.map(async call => {
  try {
    return serialize(await READ_HANDLERS[call.name](rest, ctx, call.args))
  } catch (err) {
    return serialize({ error: err instanceof UserError ? err.message : `Не удалось получить данные: ${err.message}` })
  }
}))
