// Оформление новостных сообщений в Telegram HTML: ссылки — всегда <a href> с подписью, без голых URL;
// Markdown из ответов нейронки (**жирный**, ###, «* » в начале строки) превращается в теги.

export const escapeHtml = s => String(s ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

// Подпись ссылки: название канала из labels (url → title), иначе @username для t.me/<username>/<id>, иначе домен
export const linkLabel = (url, labels = new Map()) => {
  const known = labels.get(url)
  if (known) return known
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname === 't.me' || hostname === 'telegram.me') {
      const username = pathname.split('/').filter(Boolean)[0]
      if (username && username !== 's') return `@${username}`
    }
    return hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const hasNewsLinks = text => /t\.me\//.test(text || '')

export const anchor = (url, label) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`

const MD_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g
const URL_RE = /https?:\/\/[^\s<>()[\]]+/g
const TRAILING_PUNCT_RE = /[.,;:!?]+$/
const BULLET_RE = /^[*\-•]\s+/

// Убираем то, что осталось от ссылок: пустые скобки, повисшие тире/двоеточия/запятые на концах
const cleanRest = text => {
  let result = text
  for (let prev = null; prev !== result;) {
    prev = result
    result = result.replace(/\(\s*[,;\s]*\)/g, '').replace(/\s{2,}/g, ' ').trim()
  }
  return result.replace(/[\s:,;(—–-]+$/, '').replace(/^[\s:,;)—–-]+/, '').trim()
}

// Строка → { text, links: [{ url, label }] }; текст ещё не экранирован
const extractLinks = (line, labels) => {
  const links = []
  const add = (url, label) => {
    if (!links.some(link => link.url === url)) links.push({ url, label })
  }
  let rest = line.replace(MD_LINK_RE, (_, text, url) => {
    add(url, text.trim())
    return ' '
  })
  rest = rest.replace(URL_RE, raw => {
    const url = raw.replace(TRAILING_PUNCT_RE, '')
    add(url, linkLabel(url, labels))
    return ' '
  })
  return { text: links.length > 0 ? cleanRest(rest) : rest.trim(), links }
}

// **x** / __x__ → <b>x</b>; оставшиеся одиночные маркеры убираем
const inlineMarkup = escaped => escaped
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/__(.+?)__/g, '<b>$1</b>')
  .replace(/\*\*|__/g, '')

const stripBold = text => text.replace(/\*\*|__/g, '')

// Обычный/Markdown-подобный текст нейронки → безопасный HTML для Telegram
export const formatNewsHtml = (text, labels = new Map()) => {
  const out = []
  const blank = () => {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('')
  }
  for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      blank()
      continue
    }
    const heading = line.match(/^#{1,6}\s*(.*)$/)
    const isBullet = !heading && BULLET_RE.test(line)
    const body = heading ? heading[1] : isBullet ? line.replace(BULLET_RE, '') : line
    const { text: rest, links } = extractLinks(body, labels)
    const linkLine = links.map(link => anchor(link.url, link.label)).join(' · ')

    if (!rest) {
      if (linkLine) {
        blank()
        out.push(linkLine)
      }
      continue
    }
    let html = heading ? `<b>${escapeHtml(stripBold(rest))}</b>` : inlineMarkup(escapeHtml(rest))
    if (isBullet) {
      blank()
      html = `• ${html}`
    }
    out.push(html)
    if (linkLine) out.push(linkLine)
    // заголовок отделяем пустой строкой от того, что идёт дальше
    if (heading) blank()
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Заголовок + пункты целиком, пока влезают в max знаков (длина HTML-строки). Теги не режем.
// total — сколько пунктов было всего: остаток уходит в «…и ещё N»
export const fitBlocks = (header, items, max, total = items.length) => {
  let text = header
  let shown = 0
  for (const item of items) {
    const next = `${text}\n\n${item}`
    if (next.length > max - 40) break
    text = next
    shown++
  }
  const more = total - shown
  return more > 0 ? `${text}\n\n…и ещё ${more}` : text
}

// Запасной вариант, если Telegram не принял разметку: теги долой, сущности обратно, ссылки — текстом
export const htmlToPlain = html => String(html ?? '')
  .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, '$2 $1')
  .replace(/<[^>]+>/g, '')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&')

export const isParseError = err => /can't parse entities/i.test(err?.message || '')
