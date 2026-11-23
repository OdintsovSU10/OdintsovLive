export type ChannelParseResult = { ok: true; username: string } | { ok: false; error: string }

const USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/
const LINK_RE = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.*)$/i

// @name, name, t.me/name, https://t.me/name, https://t.me/s/name, https://t.me/name/123 -> name (lowercase)
export const normalizeChannel = (input: string): ChannelParseResult => {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Введите @канал или ссылку' }

  let name = raw
  const link = LINK_RE.exec(raw)
  if (link) {
    const path = link[1].split(/[?#]/)[0].split('/').filter(Boolean)
    if (path[0] === 's') path.shift()
    const first = path[0] ?? ''
    if (first === 'joinchat' || first.startsWith('+')) {
      return { ok: false, error: 'Закрытые каналы не поддерживаются' }
    }
    name = first
  } else if (raw.startsWith('+')) {
    return { ok: false, error: 'Закрытые каналы не поддерживаются' }
  }

  const username = name.replace(/^@/, '').toLowerCase()
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Неверное имя канала: латиница, цифры и _, от 5 символов, начинается с буквы' }
  }
  return { ok: true, username }
}
