// Показания счётчиков по фото через OpenRouter (раньше — Ollama на домашнем ПК, 80–90 с на фото).
// Очередь meter_ocr_jobs: фото кладёт «Аренда» на портале, бот забирает и пишет результат;
// показания в месяц портал подставляет сам. Фото из Telegram бот распознаёт сразу.
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { UserError } from './actions.mjs'
import { OPENROUTER_URL } from './llm.mjs'

// Выбрана сравнением на настоящих фото: 24 из 24, ~2,5 с. Gemma ошибалась в литрах воды
export const METER_MODEL = 'google/gemini-3.1-flash-lite'
// Как у карточки текущего месяца на портале: до 10-го числа фото идут в прошлый месяц, если он не оплачен
const CLOSE_PREV_UNTIL_DAY = 10
const POLL_MS = 5000
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

// Форматы счётчиков квартиры: Миртек-12-РУ показывает 000633.80 (6+2 знака),
// водомеры Пульс-15У — 8 барабанов: 5 чёрных (м³) и 3 красных (литры)
const PROMPT = `You read utility meters on a photo. The photo shows either an electricity meter with an LCD display or one or more water meters with mechanical drum counters.
Electricity meter: the display shows a tariff label T1, T2 or T3 in its top-left corner and a reading in kWh like 000633.80. Return kind "electricity", the tariff label and the reading exactly as displayed, with the decimal point.
Water meter: the counter has 8 drums in a row. Return kind "water" and all 8 digits from left to right as one string without spaces, for example 00072208.
List every meter visible on the photo, ordered from left to right. Copy digits exactly, including leading zeros. If a drum is between two digits, take the lower one.`

const TOOL = {
  type: 'function',
  function: {
    name: 'report_meters',
    description: 'Report every meter visible on the photo',
    parameters: {
      type: 'object',
      properties: {
        meters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['electricity', 'water'] },
              tariff: { type: 'string', enum: ['T1', 'T2', 'T3'], description: 'Only for electricity' },
              reading: { type: 'string', description: 'Electricity: 000633.80. Water: 8 digits, e.g. 00072208' }
            },
            required: ['kind', 'reading']
          }
        }
      },
      required: ['meters']
    }
  }
}

// Формат проверяем сами: вода — последние три цифры литры
const parseMeter = m => {
  if (m?.kind === 'water' && /^\d{8}$/.test(m.reading || '')) {
    return { kind: 'water', tariff: null, value: Number(m.reading) / 1000 }
  }
  if (m?.kind === 'electricity' && /^\d{6}\.\d{2}$/.test(m.reading || '') && ['T1', 'T2', 'T3'].includes(m.tariff)) {
    return { kind: 'electricity', tariff: m.tariff, value: Number(m.reading) }
  }
  return null
}

export const recognizeMeters = async (config, imageBase64) => {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openrouterKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: METER_MODEL,
      temperature: 0,
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: 'function', function: { name: 'report_meters' } },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ]
      }]
    }),
    signal: AbortSignal.timeout(90_000)
  })
  const data = await res.json().catch(() => null)
  const call = data?.choices?.[0]?.message?.tool_calls?.[0]
  if (!res.ok || !call) throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || 'нет ответа модели'}`)
  let args
  try {
    args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments
  } catch {
    throw new Error('Модель вернула не JSON')
  }
  return (args?.meters || []).map(parseMeter).filter(Boolean)
}

// Фото после распознавания хранится только на диске (уже сжатое браузером или Telegram)
const savePhoto = (dir, { id, year, month }, photo) => {
  const folder = path.join(dir, `${year}-${String(month + 1).padStart(2, '0')}`)
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, `${id}.jpg`)
  fs.writeFileSync(file, photo)
  return file
}

const processJob = async (rest, config, id, log) => {
  const now = () => new Date().toISOString()
  const [job] = await rest(`meter_ocr_jobs?id=eq.${id}&status=eq.pending&select=id,year,month,image_base64`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'processing', updated_at: now() })
  })
  if (!job) return

  const started = Date.now()
  const image = (job.image_base64 || '').replace(/^data:[^,]+,/, '')
  let update
  try {
    if (!image) throw new Error('Нет изображения')
    const meters = await recognizeMeters(config, image)
    if (meters.length === 0) throw new Error('На фото не найдено показаний')
    const seconds = Math.round((Date.now() - started) / 1000)
    update = { status: 'done', result: { meters, model: METER_MODEL, seconds }, error: null }
    log(`meter job ${id} done in ${seconds}s`, JSON.stringify(meters))
  } catch (err) {
    update = { status: 'error', error: String(err.message || err).slice(0, 500) }
    log(`meter job ${id} failed:`, err.message || err)
  }

  if (image) {
    try {
      savePhoto(config.metersDir, job, Buffer.from(image, 'base64'))
      update.image_base64 = null
    } catch (err) {
      log(`meter job ${id}: фото не сохранено, остаётся в базе:`, err.message)
    }
  }
  await rest(`meter_ocr_jobs?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...update, updated_at: now() })
  })
}

// Очередь с портала; getConfig — текущие настройки бота (ключ OpenRouter может смениться)
export const startMeterWorker = (rest, getConfig, log) => {
  const loop = async () => {
    // задания, зависшие после перезапуска, возвращаем в очередь
    await rest('meter_ocr_jobs?status=eq.processing', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'pending' })
    }).catch(err => log('meter worker:', err.message))

    while (true) {
      try {
        const config = getConfig()
        if (config?.openrouterKey) {
          const jobs = await rest('meter_ocr_jobs?status=eq.pending&select=id&order=created_at.asc&limit=1')
          if (jobs.length > 0) {
            await processJob(rest, config, jobs[0].id, log)
            continue
          }
        }
      } catch (err) {
        log('meter worker:', err.message || err)
      }
      await sleep(POLL_MS)
    }
  }
  void loop()
}

const rentPeriod = async (rest, ctx) => {
  const [y, m, d] = ctx.today.split('-').map(Number)
  if (d <= CLOSE_PREV_UNTIL_DAY) {
    const prev = new Date(Date.UTC(y, m - 2, 1))
    const [record] = await rest(
      `rent_records?user_id=eq.${ctx.userId}&year=eq.${prev.getUTCFullYear()}&month=eq.${prev.getUTCMonth()}&select=paid`
    )
    if (!record?.paid) return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() }
  }
  return { year: y, month: m - 1 }
}

// Как на дисплее счётчика: электричество — 2 знака, вода — 3 (литры)
const reading = (value, digits) => value.toFixed(digits).replace('.', ',')

const describe = meters => {
  const lines = meters
    .filter(m => m.kind === 'electricity')
    .sort((a, b) => a.tariff.localeCompare(b.tariff))
    .map(m => `⚡ ${m.tariff}: ${reading(m.value, 2)} кВт·ч`)
  // как на портале: большее показание водомера — ХВС
  const water = meters.filter(m => m.kind === 'water').map(m => m.value).sort((a, b) => b - a)
  if (water.length === 2) lines.push(`💧 ХВС ${reading(water[0], 3)} м³ · ГВС ${reading(water[1], 3)} м³`)
  else water.forEach(value => lines.push(`💧 Вода ${reading(value, 3)} м³`))
  return lines
}

// Инструмент бота meter_photo: фото из Telegram распознаём сразу и кладём в очередь готовым
export const meterPhotoHandler = async ({ rest, ctx, track, config, photo }) => {
  if (!photo) throw new UserError('Пришли фото счётчика')
  const { year, month } = await rentPeriod(rest, ctx)
  const started = Date.now()
  const meters = await recognizeMeters(config, photo.toString('base64'))
  if (meters.length === 0) throw new UserError('Не разобрал показания — сфотографируй счётчик ближе')
  const seconds = Math.round((Date.now() - started) / 1000)
  const [job] = await rest('meter_ocr_jobs', {
    method: 'POST',
    body: JSON.stringify({
      user_id: ctx.userId, year, month, status: 'done', applied: false,
      result: { meters, model: METER_MODEL, seconds }
    })
  })
  track('meter_ocr_jobs', job.id)
  savePhoto(config.metersDir, { id: job.id, year, month }, photo)
  return [`📷 Счётчики → «Аренда», ${MONTHS[month]} ${year}`, ...describe(meters)].join('\n')
}
