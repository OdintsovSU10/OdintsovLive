// Запись разобранных нейронкой данных в таблицы Supabase (PostgREST) и отмена записей бота.
// Всё, что стоит денег, дублируется строкой в expense_transactions (source='telegram'):
// при импорте банковской выписки портал склеивает её с банковской операцией.

export const FUEL_TYPES = ['АИ-95', 'АИ-100']
export const CAR_EXPENSE_CATEGORIES = ['Мойка', 'Парковка', 'Штраф', 'Страховка', 'Налог', 'Запчасти', 'Аксессуары', 'Другое']
export const BODY_PARAM_FIELDS = {
  bicep_left: 'бицепс левый',
  bicep_right: 'бицепс правый',
  forearm_left: 'предплечье левое',
  forearm_right: 'предплечье правое',
  chest: 'грудь',
  shoulders: 'плечи',
  waist: 'талия',
  glutes: 'ягодицы',
  calf_left: 'икра левая',
  calf_right: 'икра правая',
  thigh_left: 'бедро левое',
  thigh_right: 'бедро правое'
}

// Отменять можно только то, что бот создаёт сам
const UNDO_TABLES = new Set(['expense_transactions', 'car_fuel', 'car_maintenance', 'car_expenses', 'body_weight', 'body_params'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Ошибка, которую можно показать пользователю как есть
export class UserError extends Error {}

export const createRest = ({ supabaseUrl, supabaseKey }) => async (route, init = {}) => {
  const headers = {
    apikey: supabaseKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(supabaseKey.startsWith('eyJ') ? { Authorization: `Bearer ${supabaseKey}` } : {}),
    ...init.headers
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/${route}`, { ...init, headers, signal: AbortSignal.timeout(30_000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const normalizeKey = value => (value || '').replace(/ /g, ' ').trim().replace(/\s+/g, ' ').toLowerCase()

const toNumber = value => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const round2 = n => Math.round(n * 100) / 100

// Свой формат без Intl: 12 345,5
export const fmtNum = n => {
  const [int, frac] = String(round2(n)).split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? `,${frac}` : '')
}
const fmtMoney = n => `${fmtNum(n)} ₽`

export const nowInZone = timeZone => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  )
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    weekday: new Intl.DateTimeFormat('ru-RU', { timeZone, weekday: 'long' }).format(new Date())
  }
}

export const emptyContext = timeZone => ({ userId: null, ...nowInZone(timeZone), cars: [], bankCategories: [], mappings: new Map() })

// Контекст для нейронки и обработчиков: машины, банковские категории, маппинг категорий
export const loadContext = async (rest, userId, timeZone) => {
  const [cars, categoryRows, mappingRows] = await Promise.all([
    rest(`cars?user_id=eq.${userId}&select=id,brand,model,current_mileage,is_active&order=created_at.desc`),
    rest(`expense_transactions?user_id=eq.${userId}&flow_direction=eq.out&bank_category=not.is.null&select=bank_category&order=operation_at.desc&limit=3000`),
    rest(`expense_category_mappings?user_id=eq.${userId}&select=bank_category,target_category_id`)
  ])

  const activeCars = cars.filter(c => c.is_active !== false)
  const carList = activeCars.length > 0 ? activeCars : cars
  const lastFuel = carList.length > 0
    ? await rest(`car_fuel?car_id=in.(${carList.map(c => c.id).join(',')})&select=car_id,fuel_type&order=date.desc&limit=50`)
    : []

  // Категории по частоте: самые ходовые — первыми
  const counts = new Map()
  for (const { bank_category: category } of categoryRows) {
    const name = category.trim()
    if (name) counts.set(name, (counts.get(name) || 0) + 1)
  }

  return {
    userId,
    ...nowInZone(timeZone),
    cars: carList.map(c => ({
      id: c.id,
      label: `${c.brand} ${c.model}`.trim(),
      currentMileage: c.current_mileage || 0,
      lastFuelType: lastFuel.find(f => f.car_id === c.id)?.fuel_type || FUEL_TYPES[0]
    })),
    bankCategories: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 60),
    mappings: new Map(mappingRows.map(m => [normalizeKey(m.bank_category), m.target_category_id]))
  }
}

const pickDate = (ctx, value) => (DATE_RE.test(value || '') ? value : ctx.today)

const pickCar = (ctx, carId) => {
  const car = ctx.cars.find(c => c.id === carId) || (ctx.cars.length === 1 ? ctx.cars[0] : null)
  if (!car) throw new UserError(ctx.cars.length === 0 ? 'На сайте не заведена машина' : 'Не понял, какая машина')
  return car
}

const pickCategory = (ctx, value, pattern, fallback) => {
  const exact = ctx.bankCategories.find(c => normalizeKey(c) === normalizeKey(value))
  if (exact) return exact
  if (value?.trim()) return value.trim()
  return (pattern && ctx.bankCategories.find(c => pattern.test(c))) || fallback
}

const insertOne = async (rest, table, row, track) => {
  const [created] = await rest(table, { method: 'POST', body: JSON.stringify(row) })
  track(table, created.id)
  return created
}

const updateMileage = async (rest, car, mileage) => {
  if (!mileage || mileage <= car.currentMileage) return
  await rest(`cars?id=eq.${car.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ current_mileage: mileage })
  })
  car.currentMileage = mileage
}

const insertExpense = (rest, ctx, track, { entryId, index, date, amount, category, description, note }) =>
  insertOne(rest, 'expense_transactions', {
    user_id: ctx.userId,
    source: 'telegram',
    source_row_number: 0,
    dedupe_key: `tg:${entryId}:${index}`,
    row_hash: 'tg',
    operation_at: `${date} ${date === ctx.today ? ctx.time : '12:00:00'}`,
    operation_date: date,
    status: 'Ок',
    operation_amount: -amount,
    operation_currency: 'RUB',
    payment_amount: -amount,
    payment_currency: 'RUB',
    bank_category: category,
    description,
    note,
    flow_direction: 'out',
    mapped_category_id: ctx.mappings.get(normalizeKey(category)) || null
  }, track)

const addPurchase = async ({ rest, ctx, track, entryId, index, args }) => {
  const amount = toNumber(args.amount)
  if (!amount || amount <= 0) throw new UserError('Не понял сумму покупки')
  const date = pickDate(ctx, args.date)
  const category = pickCategory(ctx, args.category, null, 'Другое')
  const what = args.description?.trim() || category
  const merchant = args.merchant?.trim()
  await insertExpense(rest, ctx, track, {
    entryId, index, date, amount: round2(amount), category,
    description: merchant || what,
    note: what
  })
  return `🛒 ${what}${merchant ? ` (${merchant})` : ''}: ${fmtMoney(amount)} · ${category} · ${date}`
}

const addFuel = async ({ rest, ctx, track, entryId, index, args }) => {
  const car = pickCar(ctx, args.car_id)
  const date = pickDate(ctx, args.date)
  let liters = toNumber(args.liters)
  let price = toNumber(args.price_per_liter)
  let total = toNumber(args.total_cost)
  if (total === null && liters && price) total = round2(liters * price)
  if (price === null && liters && total) price = round2(total / liters)
  if (liters === null && price && total) liters = round2(total / price)
  if (!liters && !total) throw new UserError('Для заправки нужны литры или сумма')
  const mileage = toNumber(args.mileage) ? Math.round(toNumber(args.mileage)) : null
  const fuelType = FUEL_TYPES.includes(args.fuel_type) ? args.fuel_type : car.lastFuelType

  await insertOne(rest, 'car_fuel', {
    car_id: car.id, date, mileage, liters, price_per_liter: price, total_cost: total, fuel_type: fuelType
  }, track)
  await updateMileage(rest, car, mileage)
  if (total) {
    await insertExpense(rest, ctx, track, {
      entryId, index, date, amount: total,
      category: pickCategory(ctx, null, /заправ|топлив|азс/i, 'Заправки'),
      description: args.station?.trim() || 'Заправка',
      note: `${fuelType}${liters ? `, ${fmtNum(liters)} л` : ''}`
    })
  }

  const volume = liters && price ? `${fmtNum(liters)} л × ${fmtNum(price)}` : liters ? `${fmtNum(liters)} л` : ''
  const parts = [
    `⛽ Заправка ${car.label}: ${fuelType}`,
    volume && total ? `${volume} = ${fmtMoney(total)}` : volume || (total ? fmtMoney(total) : ''),
    mileage ? `пробег ${fmtNum(mileage)} км` : '',
    date
  ]
  return parts.filter(Boolean).join(' · ')
}

const addCarService = async ({ rest, ctx, track, entryId, index, args }) => {
  const car = pickCar(ctx, args.car_id)
  const date = pickDate(ctx, args.date)
  const cost = toNumber(args.cost)
  const mileage = toNumber(args.mileage) ? Math.round(toNumber(args.mileage)) : null
  const description = args.description?.trim() || null
  let title = args.title?.trim() || ''

  if (args.kind === 'expense') {
    if (!cost) throw new UserError('Для расхода на машину нужна сумма')
    title = CAR_EXPENSE_CATEGORIES.find(c => normalizeKey(c) === normalizeKey(title)) || 'Другое'
    await insertOne(rest, 'car_expenses', { car_id: car.id, date, category: title, description, cost }, track)
  } else {
    if (!title) throw new UserError('Не понял, какие работы по ТО')
    await insertOne(rest, 'car_maintenance', { car_id: car.id, date, mileage, type: title, description, cost }, track)
  }
  await updateMileage(rest, car, mileage)
  if (cost) {
    await insertExpense(rest, ctx, track, {
      entryId, index, date, amount: round2(cost),
      category: pickCategory(ctx, args.category, /авто/i, 'Автоуслуги'),
      description: description || title,
      note: `${car.label}: ${title}`
    })
  }

  const icon = args.kind === 'expense' ? '🚗' : '🔧'
  const parts = [
    `${icon} ${car.label}: ${title}${description ? ` — ${description}` : ''}`,
    cost ? fmtMoney(cost) : '',
    mileage ? `пробег ${fmtNum(mileage)} км` : '',
    date
  ]
  return parts.filter(Boolean).join(' · ')
}

const addWeight = async ({ rest, ctx, track, args }) => {
  const weight = toNumber(args.weight)
  if (!weight || weight < 20 || weight > 300) throw new UserError('Не понял вес')
  const date = pickDate(ctx, args.date)
  const [row] = await rest('body_weight?on_conflict=user_id,date', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: ctx.userId, date, weight: round2(weight) })
  })
  track('body_weight', row.id)
  return `⚖️ Вес ${fmtNum(weight)} кг · ${date}`
}

const addBodyParams = async ({ rest, ctx, track, args }) => {
  const values = {}
  for (const field of Object.keys(BODY_PARAM_FIELDS)) {
    const value = toNumber(args[field])
    if (value && value > 0) values[field] = Math.round(value * 10) / 10
  }
  if (Object.keys(values).length === 0) throw new UserError('Не понял замеры')
  const date = pickDate(ctx, args.date)
  await insertOne(rest, 'body_params', { user_id: ctx.userId, date, ...values }, track)
  const list = Object.entries(values).map(([field, value]) => `${BODY_PARAM_FIELDS[field]} ${fmtNum(value)}`)
  return `📏 Замеры (см): ${list.join(', ')} · ${date}`
}

const HANDLERS = {
  add_purchase: addPurchase,
  add_fuel: addFuel,
  add_car_service: addCarService,
  add_weight: addWeight,
  add_body_params: addBodyParams
}

// messageIds — все сообщения диалога записи (реплики и уточнения): при отмене их удаляем
export const createEntry = async (rest, { userId, chatId, messageId, messageIds, inputText }) => {
  const [entry] = await rest('telegram_bot_entries', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId, chat_id: chatId, message_id: messageId, message_ids: messageIds, input_text: inputText
    })
  })
  return entry
}

// Каждый вызов инструмента — отдельная строка ответа; созданные строки копим сразу,
// чтобы отмена удаляла и то, что успело записаться до ошибки
export const executeTools = async (rest, ctx, entryId, toolCalls) => {
  const rows = []
  const lines = []
  const track = (table, id) => rows.push({ table, id })

  for (const [index, call] of toolCalls.entries()) {
    const handler = HANDLERS[call.name]
    if (!handler) {
      lines.push(`⚠️ Неизвестное действие: ${call.name}`)
      continue
    }
    try {
      lines.push(await handler({ rest, ctx, track, entryId, index, args: call.args }))
    } catch (err) {
      lines.push(`⚠️ ${err instanceof UserError ? err.message : `Не записалось: ${err.message}`}`)
    }
  }

  await rest(`telegram_bot_entries?id=eq.${entryId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ created_rows: rows })
  })
  return { lines, rows }
}

export const undoEntry = async (rest, userId, entryId) => {
  if (!UUID_RE.test(entryId || '')) return { ok: false, text: 'Неверная запись' }
  const [entry] = await rest(
    `telegram_bot_entries?id=eq.${entryId}&user_id=eq.${userId}&select=id,created_rows,undone,message_id,message_ids`
  )
  if (!entry) return { ok: false, text: 'Запись не найдена' }
  if (entry.undone) return { ok: false, text: 'Уже отменено' }

  for (const { table, id } of [...entry.created_rows].reverse()) {
    if (!UNDO_TABLES.has(table) || !UUID_RE.test(id)) continue
    // трату, уже склеенную с банковской выпиской, не трогаем — она теперь банковская
    const guard = table === 'expense_transactions' ? '&source=eq.telegram' : ''
    await rest(`${table}?id=eq.${id}${guard}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  await rest(`telegram_bot_entries?id=eq.${entryId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ undone: true })
  })
  return { ok: true, text: 'Отменено', messageIds: [...new Set([...(entry.message_ids || []), entry.message_id])] }
}
