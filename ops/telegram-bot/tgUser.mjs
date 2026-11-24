// Чтение каналов через пользовательский аккаунт Telegram (MTProto, GramJS) — для каналов,
// у которых закрыт веб-просмотр t.me/s/<канал>. Сессия лежит в <dataDir>/tg-user.json
// ({ apiId, apiHash, session }), создаётся один раз командой tgLogin.mjs. Значения оттуда никуда не пишем.
// Пакет telegram подключается лениво: без node_modules бот работает, пока аккаунт не настроен.
import fs from 'node:fs'
import path from 'node:path'

const FILE_NAME = 'tg-user.json'
const MESSAGES_LIMIT = 30
const REQUEST_TIMEOUT_MS = 30_000
const AUTH_ERRORS = new Set(['AUTH_KEY_UNREGISTERED', 'SESSION_REVOKED', 'USER_DEACTIVATED', 'USER_DEACTIVATED_BAN', 'AUTH_KEY_DUPLICATED'])
const NO_CHANNEL_ERRORS = new Set(['USERNAME_NOT_OCCUPIED', 'USERNAME_INVALID', 'CHANNEL_INVALID'])

export const AUTH_LOST_MESSAGE = 'Вход аккаунтом Telegram слетел — запусти tgLogin.mjs заново'

export const tgUserFile = dataDir => path.join(dataDir, FILE_NAME)

const readCreds = dataDir => {
  try {
    const data = JSON.parse(fs.readFileSync(tgUserFile(dataDir), 'utf8'))
    const apiId = Number(data?.apiId)
    if (!Number.isInteger(apiId) || apiId <= 0 || !data.apiHash || typeof data.session !== 'string' || !data.session) return null
    return { apiId, apiHash: String(data.apiHash), session: data.session }
  } catch {
    return null
  }
}

// Настроен ли вход: файл есть и разбирается (проверяется заново при каждом сборе — перезапуск бота не нужен)
export const isTgUserConfigured = dataDir => readCreds(dataDir) !== null

// Запись файла сессии (для tgLogin.mjs): только владелец, 0o600
export const saveTgUser = (dataDir, { apiId, apiHash, session }) => {
  fs.mkdirSync(dataDir, { recursive: true })
  const file = tgUserFile(dataDir)
  fs.writeFileSync(file, JSON.stringify({ apiId, apiHash, session }), { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

export const loadGramJs = async () => {
  try {
    const gram = await import('telegram')
    return { TelegramClient: gram.TelegramClient, StringSession: gram.sessions.StringSession, errors: gram.errors }
  } catch (err) {
    throw new Error(`Не установлен пакет telegram для чтения каналов через аккаунт (npm ci --omit=dev в папке бота): ${err.code || err.message || err}`)
  }
}

export const newClient = async ({ apiId, apiHash, session }) => {
  const { TelegramClient, StringSession } = await loadGramJs()
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 })
  // GramJS по умолчанию пишет в консоль каждое соединение — в логах докера нужны только ошибки
  client.setLogLevel('error')
  return client
}

// Одно соединение на весь бот; пересоздаётся, если в файле другая сессия (повторный вход)
let current = null // { key, client, ready: Promise<client> }

const dropClient = async () => {
  const old = current
  current = null
  if (old) await old.ready.then(client => client.disconnect(), () => {}).catch(() => {})
}

const getClient = async dataDir => {
  const creds = readCreds(dataDir)
  if (!creds) throw new Error('Вход аккаунтом Telegram не настроен — запусти tgLogin.mjs')
  const key = `${creds.apiId}:${creds.session}`
  if (current?.key !== key) {
    await dropClient()
    const entry = { key, ready: null }
    entry.ready = (async () => {
      const client = await newClient(creds)
      await client.connect()
      return client
    })()
    current = entry
    entry.ready.catch(() => {
      if (current === entry) current = null
    })
  }
  return current.ready
}

const withTimeout = (promise, ms) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Telegram не ответил за 30 с'), { transient: true })), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const toMessageError = (err, username) => {
  const rpc = String(err?.errorMessage || '')
  if (err?.name === 'FloodWaitError' || typeof err?.seconds === 'number') {
    return Object.assign(new Error(`Telegram просит подождать ${err.seconds} с`), { transient: true })
  }
  if (AUTH_ERRORS.has(rpc)) return Object.assign(new Error(AUTH_LOST_MESSAGE), { authLost: true })
  if (NO_CHANNEL_ERRORS.has(rpc)) return new Error(`Канал @${username} не найден в Telegram`)
  if (rpc === 'CHANNEL_PRIVATE') return new Error(`Канал @${username} закрытый — аккаунт Telegram на него не подписан`)
  return err instanceof Error ? err : new Error(String(err))
}

// Те же поля, что отдаёт веб-разбор в newsFetch.parseChannelPage: { title, posts: [{ postId, url, publishedAt, body }] },
// посты по убыванию postId, только с текстом (у медиа — подпись)
export const fetchChannelViaUser = async (dataDir, username, sinceId = 0) => {
  try {
    const client = await getClient(dataDir)
    const entity = await withTimeout(client.getEntity(username), REQUEST_TIMEOUT_MS)
    const messages = await withTimeout(client.getMessages(entity, { limit: MESSAGES_LIMIT, minId: sinceId || 0 }), REQUEST_TIMEOUT_MS)
    const title = String(entity?.title || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null
    const posts = []
    for (const message of messages) {
      const body = typeof message?.message === 'string' ? message.message.trim() : ''
      if (!body || !Number.isInteger(message.id) || message.id <= 0 || !message.date) continue
      posts.push({
        postId: message.id,
        url: `https://t.me/${username}/${message.id}`,
        publishedAt: new Date(message.date * 1000).toISOString(),
        body
      })
    }
    posts.sort((a, b) => b.postId - a.postId)
    return { title, posts }
  } catch (err) {
    const error = toMessageError(err, username)
    // вход слетел — следующая попытка читает файл заново, а не тянет мёртвое соединение
    if (error.authLost) await dropClient()
    throw error
  }
}
