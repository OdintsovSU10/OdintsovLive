// Разбор сообщений через OpenRouter: нейронка выбирает инструменты (tool calls) и заполняет поля,
// запись в базу делают обработчики из actions.mjs.
import { BODY_PARAM_FIELDS, CAR_EXPENSE_CATEGORIES, FUEL_TYPES } from './actions.mjs'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const fn = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
})

const buildTools = ctx => {
  const date = { type: 'string', description: 'Дата в формате YYYY-MM-DD' }
  const carId = ctx.cars.length > 0
    ? { type: 'string', enum: ctx.cars.map(c => c.id), description: 'id машины из списка' }
    : { type: 'string', description: 'id машины' }
  const money = description => ({ type: 'number', description })
  const mileage = { type: 'integer', description: 'Пробег по одометру, км, если назван' }
  const category = {
    type: 'string',
    description: 'Категория траты — самая подходящая из списка банковских категорий'
  }

  const bodyFields = Object.fromEntries(
    Object.entries(BODY_PARAM_FIELDS).map(([field, label]) => [field, { type: 'number', description: `${label}, см` }])
  )

  return [
    fn('add_purchase', 'Покупка или трата денег. Не для заправки и не для расходов на машину.', {
      date,
      amount: money('Сумма в рублях, положительное число'),
      category,
      merchant: { type: 'string', description: 'Магазин или место, если известно' },
      description: { type: 'string', description: 'Что купили, коротко, с большой буквы' }
    }, ['date', 'amount', 'category', 'description']),
    fn('add_fuel', 'Заправка машины топливом. Нужны литры или сумма.', {
      date,
      car_id: carId,
      liters: money('Литры'),
      price_per_liter: money('Цена за литр, руб'),
      total_cost: money('Сумма за заправку, руб'),
      mileage,
      fuel_type: { type: 'string', enum: FUEL_TYPES },
      station: { type: 'string', description: 'Название АЗС, если известно' }
    }, ['date', 'car_id', 'fuel_type']),
    fn('add_car_service', 'ТО, ремонт или прочий расход на машину (мойка, парковка, штраф, страховка, налог, запчасти, аксессуары).', {
      date,
      car_id: carId,
      kind: {
        type: 'string',
        enum: ['maintenance', 'expense'],
        description: 'maintenance — ТО, ремонт, работы в сервисе; expense — прочие расходы'
      },
      title: {
        type: 'string',
        description: `Для maintenance — тип работ, например «Замена масла». Для expense — одна из категорий: ${CAR_EXPENSE_CATEGORIES.join(', ')}`
      },
      description: { type: 'string', description: 'Подробности, если есть' },
      cost: money('Стоимость, руб'),
      mileage,
      category
    }, ['date', 'car_id', 'kind', 'title']),
    fn('add_weight', 'Вес тела.', {
      date,
      weight: money('Вес, кг')
    }, ['date', 'weight']),
    fn('add_body_params', 'Замеры тела в сантиметрах. Заполни только названные замеры.', {
      date,
      ...bodyFields
    }, ['date'])
  ]
}

const buildSystemPrompt = ctx => {
  const cars = ctx.cars.length > 0
    ? ctx.cars.map(c => `- id ${c.id}: ${c.label}, пробег ${c.currentMileage} км, обычно ${c.lastFuelType}`).join('\n')
    : '- машин нет'
  const categories = ctx.bankCategories.length > 0 ? ctx.bankCategories.join('; ') : 'пока нет, придумай короткую'

  return `Ты — помощник личного учёта. Пользователь пишет коротко, по-русски, бывает с опечатками, или присылает фото чека.
Сегодня ${ctx.today}, ${ctx.weekday}. «Вчера», «в пятницу» и т.п. считай от сегодняшней даты. Если дата не названа — сегодня.
Суммы в рублях: «2.5к», «2,5 тыс» = 2500.

Твоя задача — вызвать подходящие инструменты. В одном сообщении может быть несколько записей — вызови инструмент для каждой.

Машины пользователя:
${cars}

Банковские категории трат (для поля category): ${categories}

Правила:
- Заправка → add_fuel, не add_purchase. Тип топлива не назван — бери обычный для этой машины.
- ТО, ремонт, мойка, парковка, штраф, страховка, запчасти для машины → add_car_service.
- Фото чека: возьми итоговую сумму, дату и магазин. Чек с АЗС на топливо → add_fuel.
- Не выдумывай числа. Если не хватает обязательного (например, суммы покупки) или сообщение не про учёт — не вызывай инструменты, а ответь одним коротким предложением (уточняющий вопрос).`
}

const parseArgs = raw => {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

// history — сообщения диалога в формате OpenAI (user/assistant), контент может содержать фото
export const callLlm = async (config, ctx, history) => {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Odintsov Live bot'
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 1024,
      tools: buildTools(ctx),
      tool_choice: 'auto',
      usage: { include: true },
      messages: [{ role: 'system', content: buildSystemPrompt(ctx) }, ...history]
    }),
    signal: AbortSignal.timeout(90_000)
  })
  const data = await res.json().catch(() => null)
  const message = data?.choices?.[0]?.message
  if (!res.ok || !message) {
    throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || 'пустой ответ'}`)
  }

  return {
    toolCalls: (message.tool_calls || []).map(call => ({ name: call.function.name, args: parseArgs(call.function.arguments) })),
    text: typeof message.content === 'string' ? message.content.trim() : '',
    // стоимость запроса в $ и токены — для лога
    usage: data.usage || null
  }
}
