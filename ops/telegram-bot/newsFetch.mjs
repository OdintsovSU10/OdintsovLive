// Чтение публичного Telegram-канала через веб-версию https://t.me/s/<канал> — обычный GET без авторизации.
// Работает только для публичных каналов с включённым веб-просмотром. Разметка разбирается без HTML-парсера
// (в боте нет зависимостей): посты режем по .tgme_widget_message_wrap, дальше data-post, текст и time[datetime].
// Селекторы взяты из TG_Info/backend/src/ingest/telegramWeb.ts — при смене вёрстки править там и здесь.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchChannelViaUser, isTgUserConfigured } from './tgUser.mjs'

const FETCH_TIMEOUT_MS = 20_000
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const NAME_RE = /^[a-z][a-z0-9_]{4,31}$/
// пути t.me, которые выглядят как имя, но каналом не являются
const RESERVED_NAMES = new Set(['joinchat', 'addstickers', 'addemoji', 'proxy', 'socks'])

// «@name», «name», «t.me/name», «https://t.me/s/name», «https://t.me/name/123» → «name» или null
export const normalizeChannel = input => {
  let value = String(input ?? '').trim()
  value = value.replace(/^https?:\/\//i, '').replace(/^(www\.)?(t|telegram)\.me\//i, '')
  value = value.replace(/^s\//i, '')
  value = value.split(/[/?#]/)[0].replace(/^@/, '').toLowerCase()
  return NAME_RE.test(value) && !RESERVED_NAMES.has(value) ? value : null
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' }

const decodeEntities = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
  if (code[0] === '#') {
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    try {
      return String.fromCodePoint(point)
    } catch {
      return match
    }
  }
  return ENTITIES[code.toLowerCase()] ?? match
})

// <br> и закрывающие блоки — переводы строк (абзацы, списки), остальные теги убираем
const htmlToText = html => decodeEntities(
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
)
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

// Содержимое div, открытого тегом на позиции start (с учётом вложенных div)
const innerOfDiv = (html, openEnd) => {
  const tag = /<(\/?)div\b[^>]*>/gi
  tag.lastIndex = openEnd
  let depth = 1
  let match
  while ((match = tag.exec(html))) {
    depth += match[1] ? -1 : 1
    if (depth === 0) return html.slice(openEnd, match.index)
  }
  return html.slice(openEnd)
}

// Свой текст поста: у ответа первой идёт цитата (js-message_reply_text) — её пропускаем
const postText = chunk => {
  const open = /<div\b[^>]*class="([^"]*)"[^>]*>/gi
  let match
  while ((match = open.exec(chunk))) {
    const classes = match[1].split(/\s+/)
    if (classes.includes('tgme_widget_message_text') && !classes.some(name => name.includes('reply'))) {
      return htmlToText(innerOfDiv(chunk, match.index + match[0].length))
    }
  }
  return ''
}

const channelTitle = html => {
  const header = /class="[^"]*tgme_channel_info_header_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
  const og = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html)
  for (const raw of [header?.[1] && htmlToText(header[1]), og?.[1] && decodeEntities(og[1])]) {
    const title = (raw || '').replace(/\s+/g, ' ').trim()
    if (title && !/^telegram$/i.test(title)) return title.slice(0, 200)
  }
  return null
}

// Разбор страницы: { title, wraps — сколько сообщений на странице, posts — только с текстом }
export const parseChannelPage = (html, username) => {
  const starts = [...html.matchAll(/class="tgme_widget_message_wrap\b/g)].map(m => m.index)
  const posts = []
  starts.forEach((start, i) => {
    const chunk = html.slice(start, starts[i + 1] ?? html.length)
    const dataPost = /data-post="([^"]+)"/.exec(chunk)?.[1]
    const postId = Number(dataPost?.split('/')[1])
    if (!Number.isInteger(postId) || postId <= 0) return
    const body = postText(chunk)
    // пост без текста — фото, видео, стикер: оценивать нечего
    if (!body) return
    const datetime = /tgme_widget_message_date[\s\S]*?<time[^>]*datetime="([^"]+)"/.exec(chunk)?.[1]
    const published = datetime ? new Date(datetime) : null
    if (!published || Number.isNaN(published.getTime())) return
    posts.push({ postId, url: `https://t.me/${username}/${postId}`, publishedAt: published.toISOString(), body })
  })
  posts.sort((a, b) => b.postId - a.postId)
  return { title: channelTitle(html), wraps: starts.length, posts }
}

export const fetchChannel = async username => {
  const name = normalizeChannel(username)
  if (!name) throw new Error('Неверное имя канала')
  let res
  try {
    res = await fetch(`https://t.me/s/${name}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ru,en;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
  } catch (err) {
    throw new Error(`Telegram недоступен: ${err.name === 'TimeoutError' ? 'таймаут 20 с' : err.message || err}`)
  }
  if (res.status === 429) throw new Error('Telegram ограничил частоту запросов, повторю позже')
  if (!res.ok) throw new Error(`Telegram ответил HTTP ${res.status}`)
  // t.me/s/<канал> переадресует на t.me/<канал>, когда ленту не показывают в регионе сервера (так у rian_ru из РФ)
  if (!new URL(res.url).pathname.startsWith('/s/')) {
    throw Object.assign(
      new Error(`Telegram не показывает ленту @${name} в веб-версии (закрыт предпросмотр канала или ограничение по региону). Чтобы читать его, войди аккаунтом Telegram: tgLogin.mjs`),
      { webClosed: true }
    )
  }
  const { title, wraps, posts } = parseChannelPage(await res.text(), name)
  // ни одного сообщения на странице: канала нет, он закрытый или без веб-просмотра (или поменялась вёрстка)
  if (wraps === 0) throw new Error(`Канал @${name} не найден или у него закрыт веб-просмотр — публичной ленты t.me/s/${name} нет`)
  return { title, posts }
}

// Сначала веб; если веб-просмотр закрыт (редирект с t.me/s) и аккаунт Telegram настроен — читаем им.
// Остальные ошибки и каналы идут как раньше.
export const fetchChannelWithFallback = async (username, dataDir, sinceId = 0) => {
  try {
    return await fetchChannel(username)
  } catch (err) {
    if (!err.webClosed || !dataDir || !isTgUserConfigured(dataDir)) throw err
    return fetchChannelViaUser(dataDir, normalizeChannel(username), sinceId)
  }
}

// node newsFetch.mjs --probe <канал> — проверка на живой странице
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--probe') {
  try {
    const { title, posts } = await fetchChannel(process.argv[3])
    console.log(`title: ${title}`)
    console.log(`posts: ${posts.length}`)
    for (const post of posts.slice(0, 2)) console.log(`- ${post.url} ${post.publishedAt}\n  ${post.body.slice(0, 200).replace(/\n/g, ' / ')}`)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
