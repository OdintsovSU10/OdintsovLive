// Запись разобранных нейронкой данных в таблицы Supabase (PostgREST) и отмена записей бота.
// Всё, что стоит денег, дублируется строкой в expense_transactions (source='telegram'):
// при импорте банковской выписки портал склеивает её с банковской операцией.

export const FUEL_TYPES = ['АИ-95', 'АИ-100']
export const CAR_EXPENSE_CATEGORIES = ['Мойка', 'Парковка', 'Штраф', 'Страховка', 'Налог', 'Запчасти', 'Аксессуары', 'Другое']
// Ключ счётчика масла двигателя в car_maintenance.resets; остальные значения там — id агрегатов машины
export const ENGINE_OIL_KEY = 'engine_oil'
const ENGINE_OIL_LABEL = 'Масло двигателя'
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

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

// Отменять можно только то, что бот создаёт сам
const UNDO_TABLES = new Set(['expense_transactions', 'salary_payments', 'car_fuel', 'car_maintenance', 'car_expenses', 'body_weight', 'body_params', 'meter_ocr_jobs', 'todo_items'])
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

export const emptyContext = timeZone => ({ userId: null, ...nowInZone(timeZone), cars: [], bankCategories: [], categories: [], mappings: new Map() })

// Контекст для нейронки и обработчиков: машины с агрегатами, банковские и пользовательские категории, маппинг категорий
export const loadContext = async (rest, userId, timeZone) => {
  const [cars, categoryRows, mappingRows, userCategories] = await Promise.all([
    rest(`cars?user_id=eq.${userId}&select=id,brand,model,current_mileage,is_active&order=created_at.desc`),
    rest(`expense_transactions?user_id=eq.${userId}&flow_direction=eq.out&bank_category=not.is.null&select=bank_category&order=operation_at.desc&limit=3000`),
    rest(`expense_category_mappings?user_id=eq.${userId}&select=bank_category,target_category_id`),
    rest(`expense_user_categories?user_id=eq.${userId}&is_active=eq.true&select=name&order=sort_order.asc`)
  ])

  const activeCars = cars.filter(c => c.is_active !== false)
  const carList = activeCars.length > 0 ? activeCars : cars
  const carIds = carList.map(c => c.id).join(',')
  const [lastFuel, units] = carList.length > 0
    ? await Promise.all([
      rest(`car_fuel?car_id=in.(${carIds})&select=car_id,fuel_type&order=date.desc&limit=50`),
      rest(`car_service_units?car_id=in.(${carIds})&select=id,car_id,name&order=created_at.asc`)
    ])
    : [[], []]

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
      lastFuelType: lastFuel.find(f => f.car_id === c.id)?.fuel_type || FUEL_TYPES[0],
      units: units.filter(u => u.car_id === c.id).map(u => ({ id: u.id, name: u.name }))
    })),
    categories: userCategories.map(c => c.name),
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

// Что заменено: масло двигателя и агрегаты этой машины; чужие и выдуманные ключи отбрасываем
const pickResets = (car, value) => {
  const labels = new Map([[ENGINE_OIL_KEY, ENGINE_OIL_LABEL], ...car.units.map(u => [u.id, u.name])])
  return [...new Set(Array.isArray(value) ? value : [])]
    .filter(key => labels.has(key))
    .map(key => ({ key, label: labels.get(key) }))
}

const insertOne = async (rest, table, row, track) => {
  const [created] = await rest(table, { method: 'POST', body: JSON.stringify(row) })
  track(table, created.id)
  return created
}

// Прежний пробег запоминаем в записи: отмена вернёт его
const updateMileage = async (rest, car, mileage, track) => {
  if (!mileage || mileage <= car.currentMileage) return
  await rest(`cars?id=eq.${car.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ current_mileage: mileage })
  })
  track('cars', car.id, { from: car.currentMileage, to: mileage })
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

// Позиции чека: без названия или суммы строку пропускаем
const normalizeItems = value => (Array.isArray(value) ? value : [])
  .map(item => ({
    name: String(item?.name ?? '').trim().slice(0, 200),
    quantity: toNumber(item?.quantity),
    price: toNumber(item?.price),
    amount: toNumber(item?.amount)
  }))
  .filter(item => item.name && item.amount !== null)

const addPurchase = async ({ rest, ctx, track, entryId, index, args }) => {
  const amount = toNumber(args.amount)
  if (!amount || amount <= 0) throw new UserError('Не понял сумму покупки')
  const date = pickDate(ctx, args.date)
  const category = pickCategory(ctx, args.category, null, 'Другое')
  const what = args.description?.trim() || category
  const merchant = args.merchant?.trim()
  const created = await insertExpense(rest, ctx, track, {
    entryId, index, date, amount: round2(amount), category,
    description: merchant || what,
    note: what
  })

  let receipt = ''
  const items = normalizeItems(args.items)
  if (items.length > 0) {
    // в rows не трекаем: при отмене позиции удалятся каскадом вместе с тратой
    try {
      await rest('expense_receipt_items', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(items.map((item, position) => ({
          transaction_id: created.id,
          user_id: ctx.userId,
          position,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          amount: round2(item.amount)
        })))
      })
      receipt = ` · 🧾 ${items.length} поз.`
      const itemsSum = round2(items.reduce((sum, item) => sum + item.amount, 0))
      if (Math.abs(itemsSum - amount) > 1) receipt += ` (позиции на ${fmtMoney(itemsSum)}, итог ${fmtMoney(amount)})`
    } catch (err) {
      receipt = ` · ⚠️ позиции чека не записались: ${err.message}`
    }
  }
  return `🛒 ${what}${merchant ? ` (${merchant})` : ''}: ${fmtMoney(amount)} · ${category} · ${date}${receipt}`
}

const addTask = async ({ rest, ctx, track, args }) => {
  const title = String(args.title ?? '').trim()
  if (!title) throw new UserError('Не понял, какое дело записать')
  const dueDate = DATE_RE.test(args.due_date || '') ? args.due_date : null
  await insertOne(rest, 'todo_items', { user_id: ctx.userId, title, due_date: dueDate, source: 'telegram' }, track)
  return `📝 Дело: ${title}${dueDate ? ` — до ${dueDate.slice(8, 10)}.${dueDate.slice(5, 7)}` : ''}`
}

// Открытое дело по части названия: точное совпадение важнее подстроки; из нескольких — самое срочное
const completeTask = async ({ rest, ctx, args }) => {
  const query = normalizeKey(args.query)
  const notFound = () => new UserError(`Не нашёл открытого дела «${args.query?.trim() || ''}»`)
  if (!query) throw notFound()
  const open = await rest(
    `todo_items?user_id=eq.${ctx.userId}&done_at=is.null&select=id,title,due_date,created_at&order=due_date.asc.nullslast,created_at.asc&limit=500`
  )
  const task = open.find(t => normalizeKey(t.title) === query) || open.find(t => normalizeKey(t.title).includes(query))
  if (!task) throw notFound()
  await rest(`todo_items?id=eq.${task.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ done_at: new Date().toISOString() })
  })
  return `✅ Сделано: ${task.title}`
}

// Год не назван (или назван так, что месяц уходит далеко в будущее) — берём ближайший такой месяц:
// «за декабрь» в январе — это декабрь прошлого года
const pickSalaryYear = (ctx, month, value) => {
  const [currentYear, currentMonth] = ctx.today.split('-').map(Number)
  const monthsAhead = year => (year - currentYear) * 12 + month - currentMonth
  const named = toNumber(value)
  if (Number.isInteger(named) && named >= 2000 && monthsAhead(named) <= 6) return named
  return monthsAhead(currentYear) > 6 ? currentYear - 1 : currentYear
}

// Зарплата — доход: в expense_transactions не дублируем, зачисление придёт из банковской выписки
const addSalary = async ({ rest, ctx, track, args }) => {
  const amount = toNumber(args.amount)
  if (!amount || amount <= 0) throw new UserError('Не понял сумму зарплаты')
  const month = toNumber(args.month)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new UserError('Не понял, за какой месяц зарплата')
  const year = pickSalaryYear(ctx, month, args.year)
  const date = pickDate(ctx, args.date)
  const note = args.note?.trim() || null
  // в базе месяц с нуля, как на сайте (Date.getMonth)
  await insertOne(rest, 'salary_payments', {
    user_id: ctx.userId, year, month: month - 1, amount: round2(amount), date, note
  }, track)
  return `💰 Зарплата за ${MONTH_NAMES[month - 1]} ${year}: ${fmtMoney(amount)}${note ? ` · ${note}` : ''} · ${date}`
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
  await updateMileage(rest, car, mileage, track)
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
  const resets = args.kind === 'expense' ? [] : pickResets(car, args.resets)

  if (args.kind === 'expense') {
    if (!cost) throw new UserError('Для расхода на машину нужна сумма')
    title = CAR_EXPENSE_CATEGORIES.find(c => normalizeKey(c) === normalizeKey(title)) || 'Другое'
    await insertOne(rest, 'car_expenses', { car_id: car.id, date, category: title, description, cost }, track)
  } else {
    if (!title) throw new UserError('Не понял, какие работы по ТО')
    if (resets.length > 0 && !mileage) throw new UserError('Для замены нужен пробег по одометру — от него пойдёт счётчик')
    await insertOne(rest, 'car_maintenance', {
      car_id: car.id, date, mileage, type: title, description, cost, resets: resets.map(r => r.key)
    }, track)
  }
  await updateMileage(rest, car, mileage, track)
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
    resets.length > 0 ? `счётчик с нуля: ${resets.map(r => r.label).join(', ')}` : '',
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
  add_salary: addSalary,
  add_fuel: addFuel,
  add_car_service: addCarService,
  add_weight: addWeight,
  add_body_params: addBodyParams,
  add_task: addTask,
  complete_task: completeTask
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
// extras — то, чего нет в самих аргументах: фото, настройки и обработчики из других модулей
export const executeTools = async (rest, ctx, entryId, toolCalls, extras = {}) => {
  const { handlers = {}, ...context } = extras
  const rows = []
  const lines = []
  const track = (table, id, extra = {}) => rows.push({ table, id, ...extra })

  for (const [index, call] of toolCalls.entries()) {
    const handler = HANDLERS[call.name] || handlers[call.name]
    if (!handler) {
      lines.push(`⚠️ Неизвестное действие: ${call.name}`)
      continue
    }
    try {
      lines.push(await handler({ rest, ctx, track, entryId, index, args: call.args, ...context }))
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

  for (const { table, id, from, to } of [...entry.created_rows].reverse()) {
    if (table === 'cars' && UUID_RE.test(id) && Number.isInteger(from) && Number.isInteger(to)) {
      // пробег возвращаем, только если после бота его никто не менял
      await rest(`cars?id=eq.${id}&current_mileage=eq.${to}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ current_mileage: from })
      })
      continue
    }
    if (!UNDO_TABLES.has(table) || !UUID_RE.test(id)) continue
    // трату, уже склеенную с банковской выпиской, не трогаем — она теперь банковская
    // показания, которые «Аренда» уже подставила в месяц, правятся там же
    const guard = table === 'expense_transactions' ? '&source=eq.telegram'
      : table === 'meter_ocr_jobs' ? '&applied=eq.false' : ''
    await rest(`${table}?id=eq.${id}${guard}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  await rest(`telegram_bot_entries?id=eq.${entryId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ undone: true })
  })
  return { ok: true, text: 'Отменено', messageIds: [...new Set([...(entry.message_ids || []), entry.message_id])] }
}
