// Telegram-бот личного учёта: текст и фото чека разбирает нейронка (OpenRouter),
// результат пишется в таблицы Supabase, сайт их только показывает.
// Long polling — без вебхука, наружу ничего не открывается.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { createEntry, createRest, emptyContext, executeTools, loadContext, undoEntry } from './actions.mjs'
import { callLlm, transcribe } from './llm.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(DIR, '.env')
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
// Настройки из портала перечитываем раз в минуту, заодно отмечаемся «онлайн»
const SETTINGS_SYNC_MS = 60_000
// Память диалога нужна только для уточнений («сколько литров?» → «40»)
const HISTORY_LIMIT = 6
const HISTORY_TTL_MS = 10 * 60_000
const VOICE_MAX_SECONDS = 120

const HELP = `Пиши как есть, я разложу по разделам сайта:
• «заправился 40 л по 62.5, пробег 123456»
• «кофе 350», «вчера продукты в Ленте 2.4к»
• «поменял масло 4500, пробег 120 000», «мойка 800»
• «вес 82.4», «талия 84, грудь 102»
• фото чека (можно с подписью)
• голосовое — то же самое, только вслух
Под каждой записью — кнопка «Отменить».`

const log = (...args) => console.log(new Date().toISOString(), ...args)

// .env — только доступ к Supabase и часовой пояс. Ключи бота задаются в портале
// (Админка → Telegram-бот, таблица bot_settings); значения из .env — запасные.
const loadEnv = () => {
  const fileEnv = fs.existsSync(ENV_FILE) ? parseEnv(fs.readFileSync(ENV_FILE, 'utf8')) : {}
  const env = { ...process.env, ...fileEnv }
  return {
    missing: REQUIRED_ENV.filter(key => !env[key]),
    supabaseUrl: env.SUPABASE_URL?.replace(/\/$/, ''),
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    timeZone: env.TZ || 'Europe/Moscow',
    receiptsDir: env.RECEIPTS_DIR || path.join(DIR, 'data', 'receipts'),
    fallback: {
      token: env.TELEGRAM_BOT_TOKEN,
      ownerTelegramId: env.TELEGRAM_OWNER_ID,
      userId: env.OWNER_USER_ID,
      openrouterKey: env.OPENROUTER_API_KEY,
      elevenlabsKey: env.ELEVENLABS_API_KEY,
      model: env.OPENROUTER_MODEL
    }
  }
}

const loadSettings = async (base, rest) => {
  const [row = {}] = await rest(
    'bot_settings?id=eq.1&select=owner_user_id,telegram_bot_token,telegram_owner_id,openrouter_api_key,openrouter_model,elevenlabs_api_key'
  )
  const config = {
    ...base,
    token: row.telegram_bot_token || base.fallback.token,
    // пока id не задан, бот всем отвечает отказом и показывает их id — так его и узнаём
    ownerTelegramId: row.telegram_owner_id || base.fallback.ownerTelegramId || '',
    userId: row.owner_user_id || base.fallback.userId,
    openrouterKey: row.openrouter_api_key || base.fallback.openrouterKey,
    elevenlabsKey: row.elevenlabs_api_key || base.fallback.elevenlabsKey,
    model: row.openrouter_model || base.fallback.model || DEFAULT_MODEL
  }
  const missing = [['token', 'Telegram-токен'], ['openrouterKey', 'ключ OpenRouter'], ['userId', 'владелец']]
    .filter(([key]) => !config[key])
    .map(([, label]) => label)
  return { config, missing }
}

const reportStatus = (rest, patch) => rest('bot_settings?id=eq.1', {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ last_seen_at: new Date().toISOString(), ...patch })
}).catch(err => log('статус не сохранён:', err.message))

const createTelegram = token => async (method, body = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(70_000)
  })
  const data = await res.json().catch(() => null)
  if (!data?.ok) throw new Error(`Telegram ${method}: ${data?.description || res.status}`)
  return data.result
}

const downloadFile = async (config, tg, fileId) => {
  const file = await tg('getFile', { file_id: fileId })
  const res = await fetch(`https://api.telegram.org/file/bot${config.token}/${file.file_path}`, {
    signal: AbortSignal.timeout(60_000)
  })
  if (!res.ok) throw new Error(`Не скачался файл: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// После обработки чек хранится только на диске, в базу фото не пишем
const saveReceipt = (config, photo, entryId, date) => {
  const dir = path.join(config.receiptsDir, date.slice(0, 7))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${entryId}.jpg`), photo)
}

const photoContent = (photo, caption) => [
  { type: 'text', text: caption || 'Фото чека' },
  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photo.toString('base64')}` } }
]

const messageText = content => (typeof content === 'string' ? content : content[0].text)

const createBot = config => {
  const tg = createTelegram(config.token)
  const rest = createRest(config)
  const chats = new Map()

  const getChat = chatId => {
    const chat = chats.get(chatId)
    if (chat && Date.now() - chat.updatedAt < HISTORY_TTL_MS) return chat
    const fresh = { history: [], messageIds: [], photo: null, updatedAt: Date.now() }
    chats.set(chatId, fresh)
    return fresh
  }

  const reply = (msg, text, extra = {}) => tg('sendMessage', {
    chat_id: msg.chat.id,
    text,
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
    ...extra
  })

  // Чужая попытка — в портал (Админка → Telegram-бот), чтобы было видно, что бота нашли
  const noteDenied = async from => {
    const user = `${from?.id}${from?.username ? ` @${from.username}` : ''}`
    log(`отказ: ${user}`)
    await rest('rpc/note_bot_denied', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ p_user: user })
    }).catch(err => log('попытка не записана:', err.message))
  }

  const handleMessage = async msg => {
    // Только личка: в группе записи и ответы увидят посторонние
    if (msg.chat?.type !== 'private') {
      log(`выход из чата ${msg.chat?.id} (${msg.chat?.type})`)
      await tg('leaveChat', { chat_id: msg.chat.id }).catch(() => {})
      return
    }
    if (String(msg.from?.id) !== config.ownerTelegramId) {
      await noteDenied(msg.from)
      // пока владелец не задан — подсказываем id для настройки, потом чужим не отвечаем вовсе
      if (!config.ownerTelegramId) await reply(msg, `Нет доступа. Твой Telegram id: ${msg.from?.id}`)
      return
    }
    if (msg.text === '/start' || msg.text === '/help') {
      await reply(msg, HELP)
      return
    }

    const chat = getChat(msg.chat.id)
    let content
    // что бот услышал в голосовом — показываем в ответе
    let heard = ''
    if (msg.photo) {
      // Telegram присылает фото уже сжатым (до 1280 px) — берём самый крупный вариант как есть
      chat.photo = await downloadFile(config, tg, msg.photo.at(-1).file_id)
      content = photoContent(chat.photo, msg.caption)
    } else if (msg.voice) {
      if (!config.elevenlabsKey) {
        await reply(msg, 'Голосовые не настроены: нужен ключ ElevenLabs в Админке → Telegram-бот')
        return
      }
      if (msg.voice.duration > VOICE_MAX_SECONDS) {
        await reply(msg, 'Голосовое длиннее 2 минут — запиши покороче')
        return
      }
      await tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }).catch(() => {})
      heard = await transcribe(config, await downloadFile(config, tg, msg.voice.file_id))
      if (!heard) {
        await reply(msg, 'Не расслышал, повтори')
        return
      }
      content = heard
    } else if (msg.text) {
      content = msg.text
    } else {
      await reply(msg, 'Понимаю текст, голосовые и фото чека')
      return
    }
    const heardLine = heard ? `🎙 «${heard}»\n\n` : ''

    chat.history.push({ role: 'user', content })
    chat.messageIds.push(msg.message_id)
    chat.updatedAt = Date.now()
    await tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }).catch(() => {})

    const ctx = await loadContext(rest, config.userId, config.timeZone)
    const { toolCalls, text, usage } = await callLlm(config, ctx, chat.history)

    if (toolCalls.length === 0) {
      const answer = text || 'Не понял, напиши иначе'
      chat.history.push({ role: 'assistant', content: answer })
      chat.history = chat.history.slice(-HISTORY_LIMIT)
      // диалог для модели должен начинаться с реплики пользователя
      while (chat.history[0]?.role === 'assistant') chat.history.shift()
      const sent = await reply(msg, heardLine + answer)
      chat.messageIds.push(sent.message_id)
      return
    }

    const entry = await createEntry(rest, {
      userId: config.userId,
      chatId: msg.chat.id,
      messageId: msg.message_id,
      messageIds: chat.messageIds,
      inputText: chat.history.filter(m => m.role === 'user').map(m => messageText(m.content)).join('\n')
    })
    const { lines, rows } = await executeTools(rest, ctx, entry.id, toolCalls)
    if (chat.photo && rows.length > 0) {
      try {
        saveReceipt(config, chat.photo, entry.id, ctx.today)
      } catch (err) {
        log(`чек ${entry.id} не сохранён:`, err.message)
      }
    }
    chats.delete(msg.chat.id)
    log(`entry ${entry.id}: ${toolCalls.map(c => c.name).join(', ')} → ${rows.length} строк, $${usage?.cost ?? '?'}`)

    await reply(msg, heardLine + lines.join('\n'), rows.length > 0
      ? { reply_markup: { inline_keyboard: [[{ text: '↩️ Отменить', callback_data: `undo:${entry.id}` }]] } }
      : {})
  }

  const handleCallback = async cb => {
    if (String(cb.from.id) !== config.ownerTelegramId) {
      await noteDenied(cb.from)
      await tg('answerCallbackQuery', { callback_query_id: cb.id })
      return
    }
    const [action, entryId] = (cb.data || '').split(':')
    if (action !== 'undo') {
      await tg('answerCallbackQuery', { callback_query_id: cb.id })
      return
    }
    const result = await undoEntry(rest, config.userId, entryId)
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: result.text })
    if (result.ok && cb.message) {
      const chatId = cb.message.chat.id
      try {
        // в личке бот удаляет и свои, и твои сообщения, если им меньше 48 часов
        await tg('deleteMessages', { chat_id: chatId, message_ids: [...result.messageIds, cb.message.message_id] })
      } catch (err) {
        log(`entry ${entryId}: сообщения не удалены (${err.message}), помечаем`)
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: cb.message.message_id,
          text: `${cb.message.text}\n\n↩️ Отменено`
        })
      }
      log(`entry ${entryId} отменена`)
    }
  }

  const handleUpdate = async update => {
    try {
      if (update.message) await handleMessage(update.message)
      else if (update.callback_query) await handleCallback(update.callback_query)
    } catch (err) {
      log('update error:', err.message || err)
      const msg = update.message || update.callback_query?.message
      if (msg) await reply(msg, `⚠️ Ошибка: ${String(err.message || err).slice(0, 300)}`).catch(() => {})
    }
  }

  return { tg, handleUpdate }
}

const main = async () => {
  let base = loadEnv()
  while (base.missing.length > 0) {
    log(`Заполните ${ENV_FILE}: ${base.missing.join(', ')}`)
    await sleep(60_000)
    base = loadEnv()
  }
  const rest = createRest(base)

  let config = null
  let bot = null
  let offset = 0
  let syncedAt = 0

  while (true) {
    if (!bot || Date.now() - syncedAt >= SETTINGS_SYNC_MS) {
      syncedAt = Date.now()
      try {
        const next = await loadSettings(base, rest)
        if (next.missing.length > 0) throw new Error(`Не задано: ${next.missing.join(', ')}`)
        if (!bot || next.config.token !== config.token) {
          // новый токен — новый бот; модель, ключ и владелец меняются на лету
          config = next.config
          bot = createBot(config)
          await bot.tg('deleteWebhook')
          config.username = (await bot.tg('getMe')).username
          offset = 0
          log(`bot @${config.username} started, model ${config.model}`)
        } else {
          Object.assign(config, next.config)
        }
        await reportStatus(rest, { bot_username: config.username, last_error: null })
      } catch (err) {
        log('settings error:', err.message || err)
        bot = null
        await reportStatus(rest, { last_error: String(err.message || err).slice(0, 300) })
        await sleep(30_000)
        continue
      }
    }

    try {
      const updates = await bot.tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] })
      for (const update of updates) {
        offset = update.update_id + 1
        await bot.handleUpdate(update)
      }
    } catch (err) {
      log('poll error:', err.message || err)
      await sleep(5000)
    }
  }
}

// node bot.mjs --test "кофе 350" чек.jpg — только разбор нейронкой, без записи в базу.
// Если в .env есть Supabase, контекст (машины, категории) берётся из базы.
const test = async inputs => {
  const base = loadEnv()
  const rest = base.missing.length === 0 ? createRest(base) : null
  const { config } = rest
    ? await loadSettings(base, rest)
    : { config: { ...base, ...base.fallback, model: base.fallback.model || DEFAULT_MODEL } }
  if (!config.openrouterKey) throw new Error('Нужен ключ OpenRouter')
  const ctx = rest && config.userId
    ? await loadContext(rest, config.userId, config.timeZone)
    : emptyContext(config.timeZone)
  log(`model ${config.model}, машин ${ctx.cars.length}, категорий ${ctx.bankCategories.length}`)

  for (const input of inputs) {
    const content = /\.(jpe?g|png)$/i.test(input) && fs.existsSync(input)
      ? photoContent(fs.readFileSync(input), '')
      : input
    const started = Date.now()
    try {
      const result = await callLlm(config, ctx, [{ role: 'user', content }])
      log(`${input} (${((Date.now() - started) / 1000).toFixed(1)}s)`, JSON.stringify(result, null, 1))
    } catch (err) {
      log(`${input}: ${err.message}`)
    }
  }
}

if (process.argv[2] === '--test') {
  await test(process.argv.slice(3))
} else {
  main()
}
