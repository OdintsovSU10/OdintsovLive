import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface FotChecks {
  employees?: number
  timesheet?: number
  events?: number
  ok?: boolean
}

interface FotStatusResponse {
  hasToken?: boolean
  prefix?: string
  checks?: FotChecks
  error?: string
}

const FOT_TOKEN_RE = /^fot_[0-9a-f]{16}_[0-9a-f]{48}$/

function isCheckSuccessful(name: keyof Pick<FotChecks, 'employees' | 'timesheet' | 'events'>, status?: number): boolean {
  if (!status) return false
  if (name === 'employees') return status === 200
  if (name === 'events') return ![401, 403, 404].includes(status)
  return ![401, 403].includes(status)
}

function formatCheckStatus(status?: number, successful?: boolean): string {
  if (!status) return 'нет ответа'
  return successful ? 'доступ есть' : `HTTP ${status}`
}

async function callFotAdminApi(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<FotStatusResponse> {
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (error || !accessToken) {
    throw new Error('Сессия истекла. Войдите в портал заново.')
  }

  const response = await fetch(path, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  let payload: FotStatusResponse = {}
  try {
    payload = await response.json() as FotStatusResponse
  } catch {
    throw new Error(`Сервис FOT вернул некорректный ответ (HTTP ${response.status})`)
  }

  if (!response.ok) {
    const checks = payload.checks
    const suffix = checks
      ? ` Сотрудники: HTTP ${checks.employees || 0}, табель: HTTP ${checks.timesheet || 0}, события: HTTP ${checks.events || 0}.`
      : ''
    throw new Error(`${payload.error || `Ошибка HTTP ${response.status}`}.${suffix}`)
  }

  return payload
}

export default function FotTokenSettings() {
  const [status, setStatus] = useState<FotStatusResponse | null>(null)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      setStatus(await callFotAdminApi('GET', '/fot-admin/api/status'))
    } catch (requestError) {
      setStatus(null)
      setError(requestError instanceof Error ? requestError.message : 'Не удалось проверить FOT-токен')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const saveToken = async () => {
    const normalizedToken = token.trim()
    setError('')
    setSuccess('')

    if (!FOT_TOKEN_RE.test(normalizedToken)) {
      setError('Неверный формат токена. Ожидается ключ вида fot_<16 символов>_<48 символов>.')
      return
    }

    setSaving(true)
    try {
      const result = await callFotAdminApi('PUT', '/fot-admin/api/token', { token: normalizedToken })
      setStatus({ hasToken: true, prefix: result.prefix, checks: result.checks })
      setToken('')
      setShowToken(false)
      setSuccess('Новый токен проверен и сохранён.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить FOT-токен')
    } finally {
      setSaving(false)
    }
  }

  const checks = status?.checks
  const checkItems = checks ? [
    { key: 'employees' as const, label: 'Сотрудники', status: checks.employees },
    { key: 'timesheet' as const, label: 'Табель', status: checks.timesheet },
    { key: 'events' as const, label: 'События СКУД', status: checks.events }
  ] : []

  return (
    <div className="fot-token-settings">
      <div className="fot-token-header">
        <div>
          <h2><KeyRound size={21} /> FOT API</h2>
          <p>Здесь можно проверить и заменить токен, который портал использует для сотрудников, табеля и событий СКУД.</p>
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

      <div className={`fot-token-status ${checks?.ok ? 'is-ok' : status ? 'has-error' : ''}`}>
        {loading ? (
          <div className="fot-status-loading">
            <RefreshCw size={18} className="spinning" />
            Проверяем текущий токен…
          </div>
        ) : status ? (
          <>
            <div className="fot-status-summary">
              {checks?.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <div>
                <strong>{status.hasToken ? 'Токен настроен' : 'Токен не задан'}</strong>
                {status.prefix && <span>Префикс: <code>{status.prefix}…</code></span>}
              </div>
            </div>
            {checkItems.length > 0 && (
              <div className="fot-checks-grid">
                {checkItems.map(item => {
                  const successful = isCheckSuccessful(item.key, item.status)
                  return (
                    <div key={item.key} className={`fot-check-item ${successful ? 'is-ok' : 'has-error'}`}>
                      {successful ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      <span>{item.label}</span>
                      <small>{formatCheckStatus(item.status, successful)}</small>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="fot-status-summary has-error">
            <XCircle size={20} />
            <strong>Статус недоступен</strong>
          </div>
        )}
      </div>

      <div className="fot-token-form">
        <label htmlFor="fot-api-token">Новый токен</label>
        <div className="fot-token-input-row">
          <div className="fot-token-input-wrap">
            <input
              id="fot-api-token"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={event => setToken(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && token.trim() && !saving) void saveToken()
              }}
              placeholder="fot_xxxxxxxxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={saving}
            />
            <button
              type="button"
              className="fot-token-visibility"
              onClick={() => setShowToken(current => !current)}
              title={showToken ? 'Скрыть токен' : 'Показать токен'}
              aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
            >
              {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button
            type="button"
            className="fot-token-save"
            onClick={() => void saveToken()}
            disabled={!token.trim() || saving}
          >
            {saving ? 'Проверка…' : 'Проверить и сохранить'}
          </button>
        </div>
        <p className="fot-token-help">
          Перед сохранением ключ проверяется в FOT. Ему нужны доступы к таблицам <code>employees</code>,{' '}
          <code>org_departments</code> и <code>skud_events</code>. Значение токена не сохраняется в браузере.
        </p>
      </div>

      {error && <div className="fot-token-message error" role="alert">{error}</div>}
      {success && <div className="fot-token-message success" role="status">{success}</div>}
    </div>
  )
}
