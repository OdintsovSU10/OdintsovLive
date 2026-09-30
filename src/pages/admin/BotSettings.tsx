import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, Eye, EyeOff, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Секреты из базы в браузер не возвращаются — только признак «задан» и подсказка
interface BotSettingsStatus {
  has_telegram_token: boolean
  telegram_token_hint: string | null
  has_openrouter_key: boolean
  openrouter_key_hint: string | null
  has_elevenlabs_key: boolean
  elevenlabs_key_hint: string | null
  telegram_owner_id: string | null
  openrouter_model: string | null
  bot_username: string | null
  last_seen_at: string | null
  last_error: string | null
  denied_count: number
  last_denied_at: string | null
  last_denied_user: string | null
}

// Бот отмечается раз в минуту, между отметками висит long polling до 50 с
const ONLINE_WINDOW_MS = 3 * 60_000
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const TELEGRAM_TOKEN_RE = /^\d+:[A-Za-z0-9_-]{30,}$/
const OPENROUTER_KEY_RE = /^sk-or-[A-Za-z0-9_-]{20,}$/
const TELEGRAM_ID_RE = /^\d*$/

function formatSeen(value: string | null): string {
  if (!value) return 'ещё не было'
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function BotSettings() {
  const [status, setStatus] = useState<BotSettingsStatus | null>(null)
  const [telegramToken, setTelegramToken] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [elevenlabsKey, setElevenlabsKey] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [model, setModel] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const applyStatus = (data: BotSettingsStatus) => {
    setStatus(data)
    setOwnerId(data.telegram_owner_id || '')
    setModel(data.openrouter_model || '')
  }

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('get_bot_settings')
    if (rpcError) {
      setStatus(null)
      setError(rpcError.message)
    } else {
      applyStatus(data as BotSettingsStatus)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const save = async () => {
    setError('')
    setSuccess('')

    if (telegramToken.trim() && !TELEGRAM_TOKEN_RE.test(telegramToken.trim())) {
      setError('Неверный формат токена Telegram. Ожидается 123456789:AA…')
      return
    }
    if (openrouterKey.trim() && !OPENROUTER_KEY_RE.test(openrouterKey.trim())) {
      setError('Неверный формат ключа OpenRouter. Ожидается sk-or-…')
      return
    }
    if (!TELEGRAM_ID_RE.test(ownerId.trim())) {
      setError('Telegram id — только цифры.')
      return
    }

    setSaving(true)
    const { data, error: rpcError } = await supabase.rpc('set_bot_settings', {
      p_telegram_bot_token: telegramToken.trim() || null,
      p_telegram_owner_id: ownerId.trim(),
      p_openrouter_api_key: openrouterKey.trim() || null,
      p_elevenlabs_api_key: elevenlabsKey.trim() || null,
      p_openrouter_model: model.trim()
    })
    if (rpcError) {
      setError(rpcError.message)
    } else {
      applyStatus(data as BotSettingsStatus)
      setTelegramToken('')
      setOpenrouterKey('')
      setElevenlabsKey('')
      setShowSecrets(false)
      setSuccess('Сохранено. Бот подхватит изменения в течение минуты.')
    }
    setSaving(false)
  }

  const online = Boolean(
    status?.last_seen_at && !status.last_error && Date.now() - Date.parse(status.last_seen_at) < ONLINE_WINDOW_MS
  )
  const changed = Boolean(telegramToken.trim() || openrouterKey.trim() || elevenlabsKey.trim())
    || ownerId.trim() !== (status?.telegram_owner_id || '')
    || model.trim() !== (status?.openrouter_model || '')

  const statusTitle = online
    ? `Бот @${status?.bot_username} работает`
    : status?.last_error ? 'Бот не работает' : 'Бот не отвечает'

  return (
    <div className="fot-token-settings">
      <div className="fot-token-header">
        <div>
          <h2><Bot size={21} /> Telegram-бот</h2>
          <p>Бот принимает заправки, покупки, ТО, вес и фото чеков и раскладывает их по разделам портала.</p>
        </div>
        <button
          type="button"
          className="fot-refresh-btn"
          onClick={() => void loadStatus()}
          disabled={loading || saving}
          title="Обновить статус"
        >
          <RefreshCw size={17} className={loading ? 'spinning' : ''} />
          <span>Проверить</span>
        </button>
      </div>

      <div className={`fot-token-status ${online ? 'is-ok' : status ? 'has-error' : ''}`}>
        {loading ? (
          <div className="fot-status-loading">
            <RefreshCw size={18} className="spinning" />
            Загружаем настройки…
          </div>
        ) : status ? (
          <div className="fot-status-summary">
            {online ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            <div>
              <strong>{statusTitle}</strong>
              <span>{status.last_error || `Последний сигнал: ${formatSeen(status.last_seen_at)}`}</span>
              <span>
                {status.denied_count > 0
                  ? `Чужих попыток: ${status.denied_count}, последняя — ${status.last_denied_user} (${formatSeen(status.last_denied_at)})`
                  : 'Чужих попыток не было'}
              </span>
            </div>
          </div>
        ) : (
          <div className="fot-status-summary has-error">
            <XCircle size={20} />
            <strong>Настройки недоступны</strong>
          </div>
        )}
      </div>

      <div className="fot-token-form bot-settings-fields">
        <div>
          <label htmlFor="bot-telegram-token">Токен Telegram-бота</label>
          <div className="fot-token-input-wrap">
            <input
              id="bot-telegram-token"
              type={showSecrets ? 'text' : 'password'}
              value={telegramToken}
              onChange={event => setTelegramToken(event.target.value)}
              placeholder={status?.has_telegram_token ? `Задан (бот ${status.telegram_token_hint}) — пусто, чтобы не менять` : '123456789:AA…'}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={saving}
            />
            <button
              type="button"
              className="fot-token-visibility"
              onClick={() => setShowSecrets(current => !current)}
              title={showSecrets ? 'Скрыть ключи' : 'Показать ключи'}
              aria-label={showSecrets ? 'Скрыть ключи' : 'Показать ключи'}
            >
              {showSecrets ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="bot-openrouter-key">Ключ OpenRouter</label>
          <div className="fot-token-input-wrap">
            <input
              id="bot-openrouter-key"
              type={showSecrets ? 'text' : 'password'}
              value={openrouterKey}
              onChange={event => setOpenrouterKey(event.target.value)}
              placeholder={status?.has_openrouter_key ? `Задан (…${status.openrouter_key_hint}) — пусто, чтобы не менять` : 'sk-or-v1-…'}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label htmlFor="bot-elevenlabs-key">Ключ ElevenLabs (голосовые)</label>
          <div className="fot-token-input-wrap">
            <input
              id="bot-elevenlabs-key"
              type={showSecrets ? 'text' : 'password'}
              value={elevenlabsKey}
              onChange={event => setElevenlabsKey(event.target.value)}
              placeholder={status?.has_elevenlabs_key ? `Задан (…${status.elevenlabs_key_hint}) — пусто, чтобы не менять` : 'sk_…'}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label htmlFor="bot-owner-id">Telegram id владельца</label>
          <div className="fot-token-input-wrap">
            <input
              id="bot-owner-id"
              inputMode="numeric"
              value={ownerId}
              onChange={event => setOwnerId(event.target.value)}
              placeholder="Напишите боту — он ответит вашим id"
              autoComplete="off"
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label htmlFor="bot-model">Модель OpenRouter</label>
          <div className="fot-token-input-wrap">
            <input
              id="bot-model"
              value={model}
              onChange={event => setModel(event.target.value)}
              placeholder={DEFAULT_MODEL}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={saving}
            />
          </div>
        </div>

        <button
          type="button"
          className="fot-token-save"
          onClick={() => void save()}
          disabled={!changed || saving}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>

        <p className="fot-token-help">
          Токен выдаёт @BotFather. Записи бота привязываются к аккаунту, который сохранил настройки.
          Бот работает только в личке с владельцем: чужим не отвечает, из групп выходит.
          Ключи в браузер не возвращаются — видно только, что они заданы. Пустая модель — <code>{DEFAULT_MODEL}</code>.
        </p>
      </div>

      {error && <div className="fot-token-message error" role="alert">{error}</div>}
      {success && <div className="fot-token-message success" role="status">{success}</div>}
    </div>
  )
}
