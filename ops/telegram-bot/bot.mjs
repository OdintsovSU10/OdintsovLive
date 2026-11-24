// Telegram-бот личного учёта: текст и фото чека разбирает нейронка (OpenRouter),
// результат пишется в таблицы Supabase, сайт их только показывает.
// Long polling — без вебхука, наружу ничего не открывается.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { createEntry, createRest, emptyContext, executeTools, fetchRetry, loadContext, nowInZone, parseSalaryCallback, undoEntry } from './actions.mjs'
import { askLlm, transcribe } from './llm.mjs'
import { sendLifeWeeks } from './lifeWeeks.mjs'
import { meterPhotoHandler, startMeterWorker } from './meters.mjs'
import { CANCEL_MODE_KEYBOARD, MENU_BUTTONS, MENU_KEYBOARD, modeHint } from './menu.mjs'
import { classifyNewMerchants, startMerchantWorker } from './merchants.mjs'
import { normalizeReminderSettings } from './reminderSettings.mjs'
import { startNews } from './news.mjs'
import { startReminders } from './reminders.mjs'
import { startMeterAlerts } from './meterAlerts.mjs'
import { startTodoAlerts } from './todoAlerts.mjs'
import { askNextTransferNote, saveTransferNote } from './transferNotes.mjs'
import { importStatement } from './statement.mjs'

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
// Бот-API Telegram отдаёт файлы до 20 МБ
const STATEMENT_MAX_BYTES = 20 * 1024 * 1024
// Фото альбома приходят отдельными сообщениями с общим media_group_id: ждём, пока долетят все
const ALBUM_WAIT_MS = 1500

const HELP = `Кнопки внизу — режимы записи и быстрые вопросы. Или пиши как есть, я разложу по разделам сайта:
• «заправился 40 л по 62.5, пробег 123456»
• «кофе 350», «вчера продукты в Ленте 2.4к»
• «зарплата за сентябрь 150к, аванс»
• «поменял масло 4500, пробег 120 000», «мойка 800»
• «вес 82.4», «талия 84, грудь 102»
• фото чека (можно с подписью)
• голосовое — то же самое, только вслух
• фото счётчиков — показания уйдут в «Аренду»
• CSV-выписка банка файлом — импортирую операции в «Траты»
• /weeks — твоя жизнь в неделях (картинка)
• новости: «добавь канал @name», «что важного за выходные», «какие каналы» — важное из каналов приходит само
Под каждой записью — кнопка «Отменить».`

const log = (...args) => console.log(new Date().toISOString(), ...args)

// .env — только доступ к Supabase и часовой пояс. Ключи бота задаются в портале
// (Админка → Telegram-бот, таблица bot_settings); значения из .env — запасные.
// Ключ Deepgram (голосовые) — только в .env.
const loadEnv = () => {
  const fileEnv = fs.existsSync(ENV_FILE) ? parseEnv(fs.readFileSync(ENV_FILE, 'utf8')) : {}
  const env = { ...process.env, ...fileEnv }
  return {
    missing: REQUIRED_ENV.filter(key => !env[key]),
    supabaseUrl: env.SUPABASE_URL?.replace(/\/$/, ''),
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    timeZone: env.TZ || 'Europe/Moscow',
    receiptsDir: env.RECEIPTS_DIR || path.join(DIR, 'data', 'receipts'),
    metersDir: env.METERS_DIR || path.join(DIR, 'data', 'meters'),
    deepgramKey: env.DEEPGRAM_API_KEY,
    deepgramModel: env.DEEPGRAM_MODEL || 'nova-3',
    deepgramLanguage: env.DEEPGRAM_LANGUAGE || 'ru',
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
    'bot_settings?id=eq.1&select=owner_user_id,telegram_bot_token,telegram_owner_id,openrouter_api_key,openrouter_model,elevenlabs_api_key,reminder_settings'
  )
  const config = {
    ...base,
    token: row.telegram_bot_token || base.fallback.token,
    // пока id не задан, бот всем отвечает отказом и показывает их id — так его и узнаём
    ownerTelegramId: row.telegram_owner_id || base.fallback.ownerTelegramId || '',
    userId: row.owner_user_id || base.fallback.userId,
    openrouterKey: row.openrouter_api_key || base.fallback.openrouterKey,
    elevenlabsKey: row.elevenlabs_api_key || base.fallback.elevenlabsKey,
    model: row.openrouter_model || base.fallback.model || DEFAULT_MODEL,
    reminders: normalizeReminderSettings(row.reminder_settings)
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
  const res = await fetchRetry(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 70_000)
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

// photo — один буфер или массив (альбом): на каждое фото своя часть text + image_url
const photoContent = (photo, caption) => (Array.isArray(photo) ? photo : [photo]).flatMap(buffer => [
  { type: 'text', text: caption || 'Фото' },
  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } }
])

const messageText = content => (typeof content === 'string' ? content : content[0].text)

const createBot = config => {
  const tg = createTelegram(config.token)
  const rest = createRest(config)
  const chats = new Map()
  // альбомы, которые ещё собираются: `${chatId}:${media_group_id}` → { msgs, timer }
  const albums = new Map()

  // mode — режим из меню: { tool, setAt }; живёт до другой кнопки, /start или HISTORY_TTL_MS без сообщений
  const getChat = chatId => {
    const chat = chats.get(chatId)
    if (chat && Date.now() - chat.updatedAt < HISTORY_TTL_MS) {
      if (chat.mode && Date.now() - chat.mode.setAt >= HISTORY_TTL_MS) chat.mode = null
      return chat
    }
    const fresh = { history: [], messageIds: [], photo: null, photos: [], mode: null, updatedAt: Date.now() }
    chats.set(chatId, fresh)
    return fresh
  }

  // чистый диалог, при необходимости сразу с режимом
  const resetChat = (chatId, tool = null) => {
    const now = Date.now()
    const fresh = { history: [], messageIds: [], photo: null, photos: [], mode: tool ? { tool, setAt: now } : null, updatedAt: now }
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

  const handleStatement = async msg => {
    const { file_name: name = 'выписка.csv', file_size: size = 0, file_id: fileId } = msg.document
    if (/\.xlsx?$/i.test(name)) {
      await reply(msg, 'XLSX бот не читает — выгрузи выписку в CSV или загрузи этот файл на сайте («Траты» → Импорт)')
      return
    }
    if (!/\.(csv|txt)$/i.test(name)) {
      await reply(msg, 'Нужна выписка банка в формате CSV')
      return
    }
    if (size > STATEMENT_MAX_BYTES) {
      await reply(msg, 'Файл больше 20 МБ — загрузи его на сайте')
      return
    }
    await tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }).catch(() => {})
    const result = await importStatement(rest, config.userId, await downloadFile(config, tg, fileId), name)
    log(`выписка ${name}: ${JSON.stringify(result)}`)

    const parts = [
      `новых: ${result.inserted}`,
      result.updated > 0 && `обновлено: ${result.updated}`,
      result.merged > 0 && `склеено с записями бота: ${result.merged}`,
      `без изменений: ${result.unchanged}`,
      result.errors > 0 && `ошибок: ${result.errors}`
    ].filter(Boolean)
    await reply(msg, `📥 Выписка загружена${result.from ? `: ${result.from} — ${result.to}` : ''}\n${parts.join(' · ')}`)

    // название и категория для новых мерчантов — сразу, не дожидаясь фонового прогона
    if (result.inserted > 0) {
      const added = await classifyNewMerchants(rest, config, log).catch(err => {
        log('merchants после импорта:', err.message || err)
        return 0
      })
      if (added > 0) await reply(msg, `🏷 Новых мерчантов размечено: ${added}. Поправить категорию можно в «Траты» → Операции`)
    }

    await askNextTransferNote(rest, config, tg).catch(err => log('transfer notes:', err.message || err))
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

    // кнопка меню: режим записи включаем сразу, вопрос уйдёт в модель ниже, команда отработает как набранная
    const button = MENU_BUTTONS[msg.text]
    if (button) {
      if (button.mode) {
        resetChat(msg.chat.id, button.mode)
        await reply(msg, button.prompt, CANCEL_MODE_KEYBOARD)
        return
      }
      resetChat(msg.chat.id)
    }
    const command = button?.command ?? msg.text
    if (command === '/start' || command === '/menu') resetChat(msg.chat.id)
    if (command === '/start' || command === '/menu' || command === '/help') {
      await reply(msg, HELP, MENU_KEYBOARD)
      return
    }
    if (command === '/weeks') {
      const birthDate = config.reminders?.life?.birthDate
      if (!birthDate) {
        await reply(msg, 'Укажи дату рождения на сайте: Админка → Telegram-бот → Напоминания')
        return
      }
      try {
        await sendLifeWeeks(config, birthDate, nowInZone(config.timeZone).today)
      } catch (err) {
        await reply(msg, `Не получилось отправить картинку: ${err.message || err}`)
      }
      return
    }

    if (msg.document) {
      await handleStatement(msg)
      return
    }

    // фото альбома копим и обрабатываем одним сообщением, когда долетели все
    if (msg.photo && msg.media_group_id && !msg.album) {
      const key = `${msg.chat.id}:${msg.media_group_id}`
      const album = albums.get(key) ?? { msgs: [], timer: null }
      album.msgs.push(msg)
      clearTimeout(album.timer)
      album.timer = setTimeout(() => {
        albums.delete(key)
        const msgs = album.msgs.sort((a, b) => a.message_id - b.message_id)
        // handleUpdate сам ловит ошибки и отвечает пользователю
        void handleUpdate({ update_id: 0, message: { ...msgs[0], album: msgs } })
      }, ALBUM_WAIT_MS)
      albums.set(key, album)
      return
    }

    const chat = getChat(msg.chat.id)
    const meterMode = chat.mode?.tool === 'meter_photo'
    // в режиме счётчиков ждём только фото; ответ на вопрос про перевод (reply) пропускаем дальше
    if (meterMode && !msg.photo && !msg.reply_to_message) {
      chat.updatedAt = chat.mode.setAt = Date.now()
      await reply(msg, 'Жду фото счётчиков.', CANCEL_MODE_KEYBOARD)
      return
    }
    let content
    // что бот услышал в голосовом — показываем в ответе
    let heard = ''
    if (msg.photo) {
      // Telegram присылает фото уже сжатым (до 1280 px) — берём самый крупный вариант как есть
      // альбом (msg.album) — несколько фото в одном ответе; подпись — первая непустая
      const photoMsgs = msg.album ?? [msg]
      chat.photos = []
      for (const photoMsg of photoMsgs) {
        chat.photos.push(await downloadFile(config, tg, photoMsg.photo.at(-1).file_id))
      }
      chat.photo = chat.photos[0]
      const caption = photoMsgs.map(m => m.caption).find(Boolean)
      content = photoContent(chat.photos, caption)
    } else if (msg.voice) {
      if (!config.deepgramKey && !config.elevenlabsKey) {
        await reply(msg, 'Голосовые не настроены: нужен ключ ElevenLabs в Админке')
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
      content = button?.ask ?? msg.text
    } else {
      await reply(msg, 'Понимаю текст, голосовые, фото чеков и счётчиков')
      return
    }
    const heardLine = heard ? `🎙 «${heard}»\n\n` : ''

    // ответ на вопрос «за что перевод?» — в заметку операции, а не в разбор записей
    if (msg.reply_to_message && typeof content === 'string') {
      const noted = await saveTransferNote(rest, config, msg.reply_to_message.message_id, content)
      if (noted) {
        await reply(msg, heardLine + (noted.skipped ? 'Пропустил' : `✍️ Записал: «${noted.note}»`))
        await askNextTransferNote(rest, config, tg)
        return
      }
    }

    if (meterMode && !msg.photo) {
      await reply(msg, 'Жду фото счётчиков.', CANCEL_MODE_KEYBOARD)
      return
    }
    // каждое фото счётчиков — отдельная запись: прошлый диалог не тянем
    if (meterMode) {
      chat.history = []
      chat.messageIds = []
    }
    chat.history.push({ role: 'user', content })
    chat.messageIds.push(...(msg.album ?? [msg]).map(m => m.message_id))
    chat.updatedAt = Date.now()
    if (chat.mode) chat.mode.setAt = chat.updatedAt
    await tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }).catch(() => {})

    const ctx = await loadContext(rest, config.userId, config.timeZone)
    // счётчики в своём режиме читает отдельная модель — основную нейронку не зовём
    const llmResult = meterMode
      ? { toolCalls: [{ name: 'meter_photo', args: {} }], text: '', usage: null }
      : await askLlm(config, ctx, chat.history, rest, log, chat.mode ? modeHint(chat.mode.tool) : '')
    const { text, usage } = llmResult
    // meter_photo сам читает все фото альбома: повторные вызовы (модель зовёт его на каждое фото) отбрасываем
    const toolCalls = llmResult.toolCalls.filter((call, i, all) =>
      call.name !== 'meter_photo' || all.findIndex(c => c.name === 'meter_photo') === i)

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
    const { lines, rows, keyboards } = await executeTools(rest, ctx, entry.id, toolCalls, {
      config,
      photo: chat.photo,
      photos: chat.photos,
      handlers: { meter_photo: meterPhotoHandler }
    })
    // фото счётчика сохраняет meters.mjs в свою папку, в чеки его не кладём
    if (chat.photo && rows.length > 0 && !toolCalls.some(c => c.name === 'meter_photo')) {
      try {
        saveReceipt(config, chat.photo, entry.id, ctx.today)
      } catch (err) {
        log(`чек ${entry.id} не сохранён:`, err.message)
      }
    }
    // режим «Счётчики» переживает запись: фото можно слать подряд; остальные режимы — разовые
    if (meterMode) resetChat(msg.chat.id, 'meter_photo')
    else chats.delete(msg.chat.id)
    log(`entry ${entry.id}: ${toolCalls.map(c => c.name).join(', ')} → ${rows.length} строк, $${usage?.cost ?? '?'}`)

    const keyboard = rows.length > 0 ? [...keyboards, undoRow(entry.id)] : keyboards
    await reply(msg, heardLine + lines.join('\n'), keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {})
  }

  const undoRow = entryId => [{ text: '↩️ Отменить', callback_data: `undo:${entryId}` }]

  // Выбор месяца для зачисления: пишем через тот же add_salary, но уже с названным месяцем
  const handleSalaryMonth = async cb => {
    const args = parseSalaryCallback(cb.data)
    if (!args || !cb.message) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id })
      return
    }
    const ctx = { ...emptyContext(config.timeZone), userId: config.userId }
    const entry = await createEntry(rest, {
      userId: config.userId,
      chatId: cb.message.chat.id,
      messageId: cb.message.message_id,
      messageIds: [],
      inputText: `${cb.message.text}\n→ ${args.year}-${String(args.month).padStart(2, '0')}`
    })
    const { lines, rows } = await executeTools(rest, ctx, entry.id, [{ name: 'add_salary', args }])
    await tg('answerCallbackQuery', { callback_query_id: cb.id })
    await tg('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: lines.join('\n'),
      ...(rows.length > 0 ? { reply_markup: { inline_keyboard: [undoRow(entry.id)] } } : {})
    })
    log(`entry ${entry.id}: add_salary (месяц выбран кнопкой) → ${rows.length} строк`)
  }

  const handleCallback = async cb => {
    if (String(cb.from.id) !== config.ownerTelegramId) {
      await noteDenied(cb.from)
      await tg('answerCallbackQuery', { callback_query_id: cb.id })
      return
    }
    const [action, entryId] = (cb.data || '').split(':')
    if (action === 'sal') {
      await handleSalaryMonth(cb)
      return
    }
    if (action === 'mode' && cb.message) {
      resetChat(cb.message.chat.id)
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Режим выключен' })
      await tg('editMessageText', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n✖ Отменено`
      }).catch(() => {})
      return
    }
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
  // очередь фото счётчиков с портала — в этом же процессе, с текущими настройками
  startMeterWorker(rest, () => config, log)
  // мерчанты новых банковских операций: название и категория от нейронки
  startMerchantWorker(rest, () => config, log)
  startReminders(rest, () => config, () => bot, log)
  // новости из публичных Telegram-каналов: сбор и оценка важности
  startNews(rest, () => config, () => bot, log)
  startTodoAlerts(rest, () => config, () => bot, log)
  startMeterAlerts(rest, () => config, () => bot, log)
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
          await bot.tg('setMyCommands', {
            commands: [
              { command: 'start', description: 'Меню' },
              { command: 'weeks', description: 'Жизнь в неделях' },
              { command: 'help', description: 'Помощь' }
            ]
          }).catch(err => log('setMyCommands:', err.message || err))
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
// Если в .env есть Supabase, контекст (машины, категории) берётся из базы, а вопросы о данных отрабатывают с чтением.
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
      const result = await askLlm(config, ctx, [{ role: 'user', content }], rest, log)
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
