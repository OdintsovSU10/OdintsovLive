// Разбор сообщений через OpenRouter: нейронка выбирает инструменты (tool calls) и заполняет поля,
// запись в базу делают обработчики из actions.mjs. Голосовые сначала расшифровывает Deepgram
// (запасной — ElevenLabs).
import { BODY_PARAM_FIELDS, CAR_EXPENSE_CATEGORIES, ENGINE_OIL_KEY, FUEL_TYPES } from './actions.mjs'
import { buildReadTools, executeReads, isReadCall } from './reads.mjs'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Сколько раз подряд модель может запросить данные, прежде чем ответить
const MAX_READ_ROUNDS = 3
const DEEPGRAM_STT_URL = 'https://api.deepgram.com/v1/listen'
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text'

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
    fn('add_purchase', 'Покупка или трата денег. Не для заправки, не для расходов на машину и не для зарплаты и других зачислений.', {
      date,
      amount: money('Сумма в рублях, положительное число'),
      category,
      merchant: { type: 'string', description: 'Магазин или место, если известно' },
      description: { type: 'string', description: 'Что купили, коротко, с большой буквы' },
      items: {
        type: 'array',
        description: 'Позиции с фото чека, только если строки читаются; amount — итог строки в ₽',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Название позиции кратко, как в чеке, без кодов' },
            quantity: { type: 'number', description: 'Количество, если указано' },
            price: { type: 'number', description: 'Цена за единицу, ₽, если указана' },
            amount: { type: 'number', description: 'Итог строки, ₽' }
          },
          required: ['name', 'amount']
        }
      }
    }, ['date', 'amount', 'category', 'description']),
    fn('add_salary', 'Зачисление зарплаты, аванса, премии, отпускных, больничных. Это доход, не трата.', {
      date,
      amount: money('Сумма зачисления в рублях, положительное число; не баланс счёта'),
      kind: {
        type: 'string',
        enum: ['salary', 'advance', 'bonus', 'vacation', 'sick', 'unknown'],
        description: 'Строго по словам в тексте: salary — зарплата, зп, заработная плата, вторая часть; advance — аванс; bonus — премия; vacation — отпускные; sick — больничные; unknown — в тексте только «зачисление»/«поступление» от работодателя, без слова, что именно'
      },
      month: { type: 'integer', description: 'Месяц, за который выплата: 1 — январь, 12 — декабрь. Только если пользователь явно назвал месяц' },
      year: { type: 'integer', description: 'Год, за который выплата, — только если назван' }
    }, ['date', 'amount', 'kind']),
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
      category,
      resets: {
        type: 'array',
        items: { type: 'string', enum: [ENGINE_OIL_KEY, ...ctx.cars.flatMap(c => c.units.map(u => u.id))] },
        description: `Только для maintenance: что реально заменили на машине — запись начнёт счётчик пробега заново. ${ENGINE_OIL_KEY} — масло двигателя, остальные значения — id агрегатов машины. Купили, но не меняли — пустой список`
      }
    }, ['date', 'car_id', 'kind', 'title']),
    fn('meter_photo', 'Фото счётчиков электричества или воды — показания для аренды. Цифры не заполняй, их прочитает отдельная модель.', {
    }, []),
    fn('add_weight', 'Вес тела.', {
      date,
      weight: money('Вес, кг')
    }, ['date', 'weight']),
    fn('add_body_params', 'Замеры тела в сантиметрах. Заполни только названные замеры.', {
      date,
      ...bodyFields
    }, ['date']),
    fn('add_task', 'Дело, напоминание, «надо / не забыть». Не покупка: если названа сумма или магазин — это add_purchase. Если названо время — заполни remind_at, напоминания придут за 2 ч, за 1 ч и в срок.', {
      title: { type: 'string', description: 'Что сделать, коротко, с большой буквы' },
      due_date: { type: 'string', description: 'Срок в формате YYYY-MM-DD, только если назван' },
      remind_at: { type: 'string', description: 'Время срока/напоминания, если названо время: YYYY-MM-DDTHH:MM:00+03:00. «завтра до 14:00», «в 9 утра», «через 2 часа» (от текущего времени). Без времени — не заполнять, только due_date.' }
    }, ['title']),
    fn('complete_task', 'Отметить открытое дело сделанным.', {
      query: { type: 'string', description: 'Часть названия дела' }
    }, ['query'])
  ]
}

const buildSystemPrompt = ctx => {
  const cars = ctx.cars.length > 0
    ? ctx.cars.map(c => {
      const units = c.units.length > 0
        ? `; агрегаты со счётчиком пробега: ${c.units.map(u => `${u.name} (id ${u.id})`).join(', ')}`
        : ''
      return `- id ${c.id}: ${c.label}, пробег ${c.currentMileage} км, обычно ${c.lastFuelType}${units}`
    }).join('\n')
    : '- машин нет'
  const categories = ctx.bankCategories.length > 0 ? ctx.bankCategories.join('; ') : 'пока нет, придумай короткую'
  const userCategories = ctx.categories.length > 0 ? ctx.categories.join('; ') : 'пока нет'

  return `Ты — помощник личного учёта. Пользователь пишет коротко, по-русски, бывает с опечатками, или присылает фото чека.
Сегодня ${ctx.today}, ${ctx.weekday}, сейчас ${ctx.time.slice(0, 5)} (Москва). «Вчера», «в пятницу» и т.п. считай от сегодняшней даты. Если дата не названа — сегодня.
Суммы в рублях: «2.5к», «2,5 тыс» = 2500.

Твоя задача — вызвать подходящие инструменты. В одном сообщении может быть несколько записей — вызови инструмент для каждой.

Машины пользователя:
${cars}

Банковские категории трат (для поля category): ${categories}
Категории пользователя на сайте (для get_expenses): ${userCategories}

Правила:
- Заправка → add_fuel, не add_purchase. Тип топлива не назван — бери обычный для этой машины.
- ТО, ремонт, мойка, парковка, штраф, страховка, запчасти для машины → add_car_service.
- Поле resets в add_car_service — только то, что реально заменили: масло двигателя → ${ENGINE_OIL_KEY}, агрегат из списка машины → его id. «Сделал ТО», «поменял масло» — это замена масла двигателя. «Купил масло, фильтры, запчасти для ТО» без слов о замене — тоже kind maintenance, только resets пустой: покупка счётчик пробега не сбрасывает.
- Замена (resets не пуст), а пробег не назван — не вызывай инструмент, спроси пробег по одометру.
- Зарплата, зп, аванс, премия, отпускные, больничные — это зачисление, а не трата → add_salary, не add_purchase. СМС, скриншот или уведомление банка о зачислении зарплаты — тоже add_salary: дата — сегодня, если в тексте только время; сумма — сумма зачисления, не «Баланс». Поле kind — только по словам текста: нет слов «зарплата», «зп», «аванс», «премия», «отпускные», «больничные» — ставь unknown, даже если зачисление от работодателя.
- Поле month в add_salary — месяц, за который выплата, а не дата зачисления: «за сентябрь» → 9. Месяц сам не вычисляй: пользователь его не назвал — не передавай month, бот определит сам или спросит. Поле year — только если год назван.
- Фото чека: возьми итоговую сумму, дату и магазин. Чек с АЗС на топливо → add_fuel.
- По фото чека магазина заполняй items: название позиции кратко, как в чеке, без кодов; количество и цену — если указаны; amount — итог строки. Строки нечитаемы — items не заполняй.
- «Напомни», «надо», «не забыть», «запиши дело …» → add_task. Относительные даты («в субботу», «завтра», «через неделю») вычисляй от сегодняшней даты и дня недели; срока нет — due_date не заполняй. «Сделал …», «готово …» про дело → complete_task. «Какие дела», «что надо сделать» → get_tasks. Покупки (сумма, магазин) — по-прежнему add_purchase, не дело.
- Фото счётчика электричества (дисплей с кВт·ч) или водомеров → meter_photo, не add_purchase.
- Вопросы о данных («сколько потратил», «сколько можно тратить в день», «когда ТО», «как вес», «оплачена ли аренда», «какие дела») — сначала вызови нужные get_*, потом ответь по результату коротко, по-русски, суммы с ₽. Не выдумывай цифры: нет данных — так и скажи. Относительные периоды («в сентябре», «за неделю») переводи в даты от сегодняшней.
- Чтение (get_*) и запись (add_*) в одном ответе не смешивай.
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

// messages — сообщения диалога в формате OpenAI (user/assistant, а в цикле чтения ещё assistant с tool_calls и tool),
// контент может содержать фото. withReads — давать ли модели инструменты чтения
const hasImage = messages => messages.some(m => Array.isArray(m.content) && m.content.some(part => part.type === 'image_url'))

export const callLlm = async (config, ctx, messages, withReads = false) => {
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
      // с фото чека ответ длиннее: в нём позиции
      max_tokens: hasImage(messages) ? 2048 : 1024,
      tools: withReads ? [...buildTools(ctx), ...buildReadTools()] : buildTools(ctx),
      tool_choice: 'auto',
      usage: { include: true },
      messages: [{ role: 'system', content: buildSystemPrompt(ctx) }, ...messages]
    }),
    signal: AbortSignal.timeout(90_000)
  })
  const data = await res.json().catch(() => null)
  const message = data?.choices?.[0]?.message
  if (!res.ok || !message) {
    throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || 'пустой ответ'}`)
  }

  return {
    toolCalls: (message.tool_calls || []).map(call => ({ id: call.id, name: call.function.name, args: parseArgs(call.function.arguments) })),
    // tool_calls как вернул OpenRouter — для следующего запроса в цикле чтения
    rawToolCalls: message.tool_calls || [],
    text: typeof message.content === 'string' ? message.content.trim() : '',
    // стоимость запроса в $ и токены — для лога
    usage: data.usage || null
  }
}

// Диалог с чтением данных: модель вызывает get_*, получает результаты и отвечает (до MAX_READ_ROUNDS раундов).
// Возвращает то же, что callLlm: toolCalls — только запись, text — ответ; usage суммируется по запросам.
// Без rest/userId (тест без базы) инструменты чтения не даём.
export const askLlm = async (config, ctx, history, rest, log = () => {}) => {
  const canRead = Boolean(rest && ctx.userId)
  const messages = [...history]
  let cost = 0

  for (let round = 0; ; round++) {
    const withReads = canRead && round < MAX_READ_ROUNDS
    const result = await callLlm(config, ctx, messages, withReads)
    cost += Number(result.usage?.cost) || 0
    const usage = { ...result.usage, cost }

    const reads = result.toolCalls.filter(isReadCall)
    if (reads.length === 0 || !withReads) {
      return { toolCalls: result.toolCalls.filter(call => !isReadCall(call)), text: result.text, usage }
    }

    const skipped = result.toolCalls.filter(call => !isReadCall(call))
    if (skipped.length > 0) log(`чтение вместе с записью, запись пропущена: ${skipped.map(c => c.name).join(', ')}`)
    log(`чтение (раунд ${round + 1}): ${reads.map(c => c.name).join(', ')}`)

    const outputs = await executeReads(rest, ctx, reads)
    const outputById = new Map(reads.map((call, i) => [call.id, outputs[i]]))
    messages.push({ role: 'assistant', content: result.text || null, tool_calls: result.rawToolCalls })
    for (const [i, call] of result.toolCalls.entries()) {
      messages.push({
        role: 'tool',
        tool_call_id: result.rawToolCalls[i].id,
        content: outputById.get(call.id) ?? JSON.stringify({ error: 'Запись в одном ответе с чтением не выполнена' })
      })
    }
  }
}

// Голосовое (OGG/Opus из Telegram) → текст через Deepgram: файл уходит телом запроса как есть
const transcribeDeepgram = async (config, audio) => {
  const params = new URLSearchParams({
    model: config.deepgramModel,
    language: config.deepgramLanguage,
    punctuate: 'true',
    smart_format: 'true'
  })
  const res = await fetch(`${DEEPGRAM_STT_URL}?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${config.deepgramKey}`, 'Content-Type': 'audio/ogg' },
    body: audio,
    signal: AbortSignal.timeout(60_000)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`Deepgram ${res.status}: ${data?.err_msg || 'ошибка распознавания'}`)
  }
  return (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
}

// Запасной вариант, пока ключа Deepgram нет: ElevenLabs Scribe. ElevenLabs блокирует РФ,
// поэтому запрос идёт через tinyproxy на nl3 (HTTPS_PROXY в docker-compose.yml)
const transcribeElevenlabs = async (config, audio) => {
  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/ogg' }), 'voice.ogg')
  form.append('model_id', 'scribe_v2')
  form.append('language_code', 'ru')
  form.append('tag_audio_events', 'false')
  const res = await fetch(ELEVENLABS_STT_URL, {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabsKey },
    body: form,
    signal: AbortSignal.timeout(60_000)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${data?.detail?.message || 'ошибка распознавания'}`)
  }
  return (data?.text || '').trim()
}

export const transcribe = (config, audio) =>
  (config.deepgramKey ? transcribeDeepgram(config, audio) : transcribeElevenlabs(config, audio))
