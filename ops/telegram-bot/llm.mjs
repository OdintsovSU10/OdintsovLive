// Разбор сообщений через OpenRouter: нейронка выбирает инструменты (tool calls) и заполняет поля,
// запись в базу делают обработчики из actions.mjs. Голосовые сначала расшифровывает Deepgram
// (запасной — ElevenLabs).
import { BODY_PARAM_FIELDS, CAR_EXPENSE_CATEGORIES, ENGINE_OIL_KEY, FUEL_TYPES } from './actions.mjs'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
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
      description: { type: 'string', description: 'Что купили, коротко, с большой буквы' }
    }, ['date', 'amount', 'category', 'description']),
    fn('add_salary', 'Зачисление зарплаты, аванса, премии, отпускных. Это доход, не трата.', {
      date,
      amount: money('Сумма зачисления в рублях, положительное число'),
      month: { type: 'integer', description: 'Месяц, за который зарплата: 1 — январь, 12 — декабрь' },
      year: { type: 'integer', description: 'Год, за который зарплата, — только если назван' },
      note: { type: 'string', description: 'Комментарий пользователя его словами: «аванс», «премия», «вторая часть»' }
    }, ['date', 'amount', 'month']),
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
    }, ['date'])
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
- Поле resets в add_car_service — только то, что реально заменили: масло двигателя → ${ENGINE_OIL_KEY}, агрегат из списка машины → его id. «Сделал ТО», «поменял масло» — это замена масла двигателя. «Купил масло, фильтры, запчасти для ТО» без слов о замене — тоже kind maintenance, только resets пустой: покупка счётчик пробега не сбрасывает.
- Замена (resets не пуст), а пробег не назван — не вызывай инструмент, спроси пробег по одометру.
- Зарплата, зп, аванс, премия, отпускные, больничные — это зачисление, а не трата → add_salary, не add_purchase. Скриншот или уведомление банка о зачислении зарплаты — тоже add_salary.
- Поле month в add_salary — месяц, за который зарплата, а не дата зачисления: «за сентябрь» → 9, «за прошлый месяц» считай от сегодняшней даты. Месяц не назван — не вызывай инструмент, спроси «За какой месяц?». Поле year — только если год назван.
- Поле note в add_salary — комментарий пользователя его словами, без суммы и месяца. Комментария нет — не заполняй.
- Фото чека: возьми итоговую сумму, дату и магазин. Чек с АЗС на топливо → add_fuel.
- Фото счётчика электричества (дисплей с кВт·ч) или водомеров → meter_photo, не add_purchase.
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
