// Воркер распознавания показаний счётчиков: забирает фото из meter_ocr_jobs (Supabase),
// распознаёт локальной моделью через Ollama и пишет результат обратно.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(DIR, '.env')

const PROMPT = `You read utility meters on a photo. The photo shows either an electricity meter with an LCD display or one or more water meters with mechanical drum counters.
Electricity meter: the display shows a tariff label T1, T2 or T3 in its top-left corner and a reading in kWh like 000633.80. Return kind "electricity", tariff = the label, integer = digits before the decimal point, fraction = digits after it.
Water meter: black drums are cubic meters, red drums are liters. Return kind "water", tariff "none", integer = the black digits, fraction = the red digits.
List every meter visible on the photo, ordered from left to right. Copy digits exactly, including leading zeros. If a drum is between two digits, take the lower one.`

const SCHEMA = {
  type: 'object',
  properties: {
    meters: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['electricity', 'water'] },
          tariff: { type: 'string', enum: ['T1', 'T2', 'T3', 'none'] },
          integer: { type: 'string', pattern: '^[0-9]{1,8}$' },
          fraction: { type: 'string', pattern: '^[0-9]{0,4}$' }
        },
        required: ['kind', 'tariff', 'integer', 'fraction']
      }
    }
  },
  required: ['meters']
}

const log = (...args) => console.log(new Date().toISOString(), ...args)

const loadConfig = () => {
  if (!fs.existsSync(ENV_FILE)) return null
  process.loadEnvFile(ENV_FILE)
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const supabaseKey = process.env.SUPABASE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  return {
    supabaseUrl,
    supabaseKey,
    ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'qwen3-vl:4b-instruct',
    pollMs: Number(process.env.POLL_INTERVAL_MS) || 5000,
    photosDir: process.env.PHOTOS_DIR || path.join(DIR, 'photos')
  }
}

// Фото приходит уже сжатым браузером (JPEG, до 1280 px) — сохраняем как есть
const savePhoto = (photosDir, job) => {
  const period = `${job.year}-${String(job.month + 1).padStart(2, '0')}`
  const dir = path.join(photosDir, period)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${job.id}.jpg`)
  fs.writeFileSync(file, Buffer.from(job.image_base64.replace(/^data:[^,]+,/, ''), 'base64'))
  return file
}

const createRest = ({ supabaseUrl, supabaseKey }) => async (query, init = {}) => {
  const headers = {
    apikey: supabaseKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(supabaseKey.startsWith('eyJ') ? { Authorization: `Bearer ${supabaseKey}` } : {}),
    ...init.headers
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/meter_ocr_jobs?${query}`, { ...init, headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// node:http без таймаутов: распознавание на CPU может идти несколько минут
const ollamaRequest = (ollamaUrl, method, route, body) => new Promise((resolve, reject) => {
  const payload = body ? JSON.stringify(body) : undefined
  const req = http.request(new URL(route, ollamaUrl), {
    method,
    headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
  }, res => {
    const chunks = []
    res.on('data', chunk => chunks.push(chunk))
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (res.statusCode !== 200) reject(new Error(`Ollama ${res.statusCode}: ${text.slice(0, 300)}`))
      else resolve(JSON.parse(text))
    })
  })
  req.on('error', reject)
  if (payload) req.write(payload)
  req.end()
})

const toNumber = (integer, fraction) => {
  const int = String(integer).replace(/\D/g, '') || '0'
  const frac = String(fraction).replace(/\D/g, '') || '0'
  return Number(`${int}.${frac}`)
}

const recognize = async (config, imageBase64) => {
  const image = imageBase64.replace(/^data:[^,]+,/, '')
  const response = await ollamaRequest(config.ollamaUrl, 'POST', '/api/chat', {
    model: config.model,
    stream: false,
    think: false,
    format: SCHEMA,
    // лимит токенов страхует от зацикливания модели
    options: { temperature: 0, num_predict: 256 },
    messages: [{ role: 'user', content: PROMPT, images: [image] }]
  })
  const raw = response.message.content
  if (config.debug) log('raw:', raw)
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Модель вернула не JSON: ${raw.slice(0, 200)}`)
  }
  return parsed.meters.map(m => ({
    kind: m.kind,
    tariff: m.kind === 'electricity' && m.tariff !== 'none' ? m.tariff : null,
    value: toNumber(m.integer, m.fraction)
  }))
}

const processJob = async (config, rest, id) => {
  const now = () => new Date().toISOString()
  const [job] = await rest(`id=eq.${id}&status=eq.pending&select=id,year,month,image_base64`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'processing', updated_at: now() })
  })
  if (!job) return

  const started = Date.now()
  let update
  try {
    if (!job.image_base64) throw new Error('Нет изображения')
    const meters = await recognize(config, job.image_base64)
    const seconds = Math.round((Date.now() - started) / 1000)
    update = { status: 'done', result: { meters, model: config.model, seconds }, error: null }
    log(`job ${id} done in ${seconds}s`, JSON.stringify(meters))
  } catch (err) {
    update = { status: 'error', error: String(err.message || err).slice(0, 500) }
    log(`job ${id} failed:`, err.message || err)
  }

  // после распознавания фото хранится только на диске, из БД удаляем
  if (job.image_base64) {
    try {
      const file = savePhoto(config.photosDir, job)
      update.image_base64 = null
      log(`job ${id} photo saved to ${file}`)
    } catch (err) {
      log(`job ${id} photo not saved, keeping in DB:`, err.message || err)
    }
  }

  await rest(`id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...update, updated_at: now() })
  })
}

const main = async () => {
  let config = loadConfig()
  while (!config) {
    log(`Заполните ${ENV_FILE} (SUPABASE_URL, SUPABASE_KEY)`)
    await sleep(60_000)
    config = loadConfig()
  }
  const rest = createRest(config)
  log(`worker started, model ${config.model}`)

  let recovered = false
  while (true) {
    try {
      await ollamaRequest(config.ollamaUrl, 'GET', '/api/version')
      if (!recovered) {
        // задания, зависшие после перезапуска воркера, возвращаем в очередь
        await rest('status=eq.processing', {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'pending' })
        })
        recovered = true
      }
      const jobs = await rest('status=eq.pending&select=id&order=created_at.asc&limit=1')
      if (jobs.length > 0) {
        await processJob(config, rest, jobs[0].id)
        continue
      }
    } catch (err) {
      log('loop error:', err.message || err)
    }
    await sleep(config.pollMs)
  }
}

const testImage = async file => {
  const config = {
    ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'qwen3-vl:4b-instruct',
    debug: true
  }
  const started = Date.now()
  try {
    const meters = await recognize(config, fs.readFileSync(file).toString('base64'))
    log(`${file}: ${Math.round((Date.now() - started) / 1000)}s`, JSON.stringify(meters))
  } catch (err) {
    log(`${file}: failed after ${Math.round((Date.now() - started) / 1000)}s:`, err.message || err)
  }
}

if (process.argv[2] === '--test') {
  for (const file of process.argv.slice(3)) await testImage(file)
} else {
  main()
}
