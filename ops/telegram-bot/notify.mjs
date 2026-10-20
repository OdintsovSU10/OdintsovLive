// Разовые уведомления владельцу: утренняя сводка, недельный дайджест, лимиты бюджета, ТО, страховки.
// Каждая проверка — (rest, config, today, bot): шлёт сама через once и ничего не возвращает.
// Что уже отправлено, помнит таблица bot_notifications_sent — переживает перезапуск бота.
import { fmtNum } from './actions.mjs'
import { addDays, budgetStatus, loadCategoryNames, loadOperations, round2 } from './budget.mjs'
import { READ_HANDLERS } from './reads.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const TASKS_LIMIT = 5
const SERVICE_KM_SOON = 500
const SERVICE_MONTHS_SOON = 1
const INSURANCE_SOON_DAYS = 30
// Пороги от строгого к мягкому: 0 — срок вышел или истекает сегодня
const INSURANCE_THRESHOLDS = [0, 7, 30]
const INSURANCE_NAMES = { osago: 'ОСАГО', kasko: 'КАСКО' }
const TOP_CATEGORIES = 3

const send = (config, bot, text) => bot.tg('sendMessage', { chat_id: config.ownerTelegramId, text })

// Отправляет send() один раз на ключ. Ошибка send — ключ не ставится, на следующем тике повторим
export const once = async (rest, userId, key, sendFn) => {
  const found = await rest(`bot_notifications_sent?user_id=eq.${userId}&key=eq.${encodeURIComponent(key)}&select=key&limit=1`)
  if (found.length > 0) return false
  await sendFn()
  await rest('bot_notifications_sent?on_conflict=user_id,key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, key })
  })
  return true
}

const markSent = (rest, userId, key) => once(rest, userId, key, async () => {})

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
const ruDate = date => date.slice(5).split('-').reverse().join('.')
const ruDateFull = date => date.split('-').reverse().join('.')
// деньги в сводках — до рубля, копейки только шумят
const rub = n => fmtNum(Math.round(n))
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`

const loadCars = async (rest, userId, today) => (await READ_HANDLERS.get_car(rest, { userId, today }, {})).cars || []

// Состояние ТО: over — пора, soon — скоро (или пора), null — всё в порядке
const serviceState = car => {
  const oil = car.oil_service
  if (!oil) return null
  const kmLeft = oil.km_left
  const monthsLeft = oil.months_left
  if ((kmLeft !== null && kmLeft <= 0) || monthsLeft <= 0) return 'over'
  if ((kmLeft !== null && kmLeft <= SERVICE_KM_SOON) || monthsLeft <= SERVICE_MONTHS_SOON) return 'soon'
  return null
}

const serviceLeftText = oil => {
  const parts = []
  if (oil.km_left !== null) parts.push(oil.km_left > 0 ? `осталось ${fmtNum(oil.km_left)} км` : `перепробег ${fmtNum(-oil.km_left)} км`)
  parts.push(oil.months_left > 0 ? `${oil.months_left} мес.` : 'срок по времени вышел')
  return parts.join(', ')
}

const insuranceLine = (name, until, today) => {
  const days = daysBetween(today, until)
  if (days < 0) return `${name} просрочено на ${-days} дн. (до ${ruDateFull(until)})`
  if (days === 0) return `${name} истекает сегодня`
  return `${name} до ${ruDateFull(until)} (через ${days} дн.)`
}

// ---------- 1. Утренняя сводка ----------

const dueTasks = (rest, userId, today) => rest(`todo_items?user_id=eq.${userId}&done_at=is.null&due_date=lte.${today}&select=title,due_date&order=due_date.asc,created_at.asc&limit=${TASKS_LIMIT}`)

const buildMorning = async (rest, config, today) => {
  const [budget, tasks, cars] = await Promise.all([
    budgetStatus(rest, config.userId, today),
    dueTasks(rest, config.userId, today),
    loadCars(rest, config.userId, today)
  ])
  const blocks = []

  if (budget.configured) {
    blocks.push(`💰 Можно тратить ${fmtNum(budget.allowancePerDay)} ₽/день до конца месяца (осталось ${budget.daysLeft} дн.)`)
  }

  if (tasks.length > 0) {
    const lines = tasks.map(t => `• ${t.title}${t.due_date < today ? ` (просрочено с ${ruDate(t.due_date)})` : ''}`)
    blocks.push(['⏰ Дела на сегодня:', ...lines].join('\n'))
  }

  const carLines = []
  for (const car of cars) {
    if (serviceState(car)) carLines.push(`🔧 ${car.label}: ТО — ${serviceLeftText(car.oil_service)}`)
    for (const kind of ['osago', 'kasko']) {
      const until = car[`${kind}_until`]
      if (until && daysBetween(today, until) <= INSURANCE_SOON_DAYS) carLines.push(`🛡 ${car.label}: ${insuranceLine(INSURANCE_NAMES[kind], until, today)}`)
    }
  }
  if (carLines.length > 0) blocks.push(carLines.join('\n'))

  return blocks.length > 0 ? ['☀️ Доброе утро', ...blocks].join('\n\n') : null
}

export const morningBrief = (rest, config, today, bot) => once(rest, config.userId, `morning:${today}`, async () => {
  const text = await buildMorning(rest, config, today)
  if (text) await send(config, bot, text)
})

// ---------- 5. Недельный дайджест ----------

const localDate = (iso, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

const sumCost = (rows, field) => rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)

const buildWeekly = async (rest, config, today) => {
  const { userId, timeZone } = config
  // today — понедельник: прошлая неделя [today-7, today-1], позапрошлая [today-14, today-8]
  const from = addDays(today, -7)
  const to = addDays(today, -1)
  const prevFrom = addDays(today, -14)

  const [operations, categoryNames, doneRows, weights, cars] = await Promise.all([
    loadOperations(rest, userId, prevFrom, today),
    loadCategoryNames(rest, userId),
    rest(`todo_items?user_id=eq.${userId}&done_at=gte.${addDays(from, -1)}T00:00:00Z&done_at=lt.${addDays(today, 1)}T00:00:00Z&select=done_at&limit=1000`),
    rest(`body_weight?user_id=eq.${userId}&date=gte.${from}&date=lte.${to}&select=weight&order=date.asc,created_at.asc&limit=100`),
    rest(`cars?user_id=eq.${userId}&select=id`)
  ])
  const lines = []

  const spent = operations.filter(op => op.direction === 'out')
  const week = spent.filter(op => op.date >= from)
  const total = sumCost(week, 'amount')
  const prevTotal = sumCost(spent.filter(op => op.date < from), 'amount')
  if (total > 0) {
    let line = `💸 Потрачено ${rub(total)} ₽`
    if (prevTotal > 0) {
      const pct = Math.round(((total - prevTotal) / prevTotal) * 100)
      line += ` (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}% к прошлой неделе)`
    }
    lines.push(line)
    const byCategory = new Map()
    for (const op of week) {
      const name = categoryNames.get(op.categoryId) || 'Без категории'
      byCategory.set(name, (byCategory.get(name) || 0) + op.amount)
    }
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_CATEGORIES)
    lines.push(`Топ: ${top.map(([name, sum]) => `${name} ${rub(sum)} ₽`).join(', ')}`)
  }

  const done = doneRows.filter(r => {
    const date = localDate(r.done_at, timeZone)
    return date >= from && date <= to
  }).length
  if (done > 0) lines.push(`✅ Дел сделано: ${done}`)

  if (weights.length >= 2) {
    const first = Number(weights[0].weight)
    const last = Number(weights[weights.length - 1].weight)
    lines.push(`⚖️ Вес ${fmtNum(first)} → ${fmtNum(last)} кг (${signed(round2(last - first))})`)
  }

  if (cars.length > 0) {
    const ids = cars.map(c => c.id).join(',')
    const [fuel, expenses] = await Promise.all([
      rest(`car_fuel?car_id=in.(${ids})&date=gte.${from}&date=lte.${to}&select=total_cost&limit=1000`),
      rest(`car_expenses?car_id=in.(${ids})&date=gte.${from}&date=lte.${to}&select=cost&limit=1000`)
    ])
    const carTotal = sumCost(fuel, 'total_cost') + sumCost(expenses, 'cost')
    if (carTotal > 0) lines.push(`🚗 На машину ${rub(carTotal)} ₽`)
  }

  return lines.length > 0 ? [`📊 Неделя ${ruDate(from)}–${ruDate(to)}`, ...lines].join('\n') : null
}

export const weeklyDigest = (rest, config, today, bot) => {
  if (new Date(`${today}T00:00:00Z`).getUTCDay() !== 1) return null
  return once(rest, config.userId, `weekly:${today}`, async () => {
    const text = await buildWeekly(rest, config, today)
    if (text) await send(config, bot, text)
  })
}

// ---------- 2. Лимиты бюджета ----------

export const budgetLimits = async (rest, config, today, bot) => {
  const budget = await budgetStatus(rest, config.userId, today)
  if (!budget.configured) return null
  for (const c of budget.categories) {
    if (c.share < 0.8) continue
    const key80 = `budget80:${c.category_id}:${budget.start}`
    const key100 = `budget100:${c.category_id}:${budget.start}`
    if (c.share >= 1) {
      await once(rest, config.userId, key100, () => send(config, bot, `🔴 ${c.name}: лимит превышен на ${rub(-c.left)} ₽`))
      await markSent(rest, config.userId, key80)
    } else {
      const pct = Math.round(c.share * 100)
      await once(rest, config.userId, key80, () => send(config, bot, `⚠️ ${c.name}: ${rub(c.spent)} из ${rub(c.limit)} ₽ (${pct}%). Осталось ${rub(c.left)} ₽ до конца месяца`))
    }
  }
  return null
}

// ---------- 3. ТО ----------

export const serviceSoon = async (rest, config, today, bot) => {
  for (const car of await loadCars(rest, config.userId, today)) {
    const state = serviceState(car)
    if (!state) continue
    const oil = car.oil_service
    const keySoon = `service-soon:${car.label}:${oil.date}`
    const keyOver = `service-over:${car.label}:${oil.date}`
    const base = `${car.label}: пробег ${fmtNum(car.current_mileage)} км, последнее ТО ${ruDateFull(oil.date)}${oil.mileage ? ` на ${fmtNum(oil.mileage)} км` : ''}`
    if (state === 'over') {
      await once(rest, config.userId, keyOver, () => send(config, bot, `🔴 Пора на ТО. ${base} — ${serviceLeftText(oil)}`))
      await markSent(rest, config.userId, keySoon)
    } else {
      await once(rest, config.userId, keySoon, () => send(config, bot, `🔧 Скоро ТО. ${base} — ${serviceLeftText(oil)}`))
    }
  }
  return null
}

// ---------- 4. Страховка ----------

export const insuranceExpiring = async (rest, config, today, bot) => {
  for (const car of await loadCars(rest, config.userId, today)) {
    for (const kind of Object.keys(INSURANCE_NAMES)) {
      const until = car[`${kind}_until`]
      if (!until) continue
      const days = daysBetween(today, until)
      // достигнутые пороги: шлём самый строгий, остальные только отмечаем
      const reached = INSURANCE_THRESHOLDS.filter(t => days <= t)
      if (reached.length === 0) continue
      const [strictest, ...others] = reached
      const keyOf = t => `${kind}${t}:${car.label}:${until}`
      const icon = days <= 0 ? '🔴' : '🛡'
      await once(rest, config.userId, keyOf(strictest), () => send(config, bot, `${icon} ${car.label}: ${insuranceLine(INSURANCE_NAMES[kind], until, today)}`))
      for (const t of others) await markSent(rest, config.userId, keyOf(t))
    }
  }
  return null
}
