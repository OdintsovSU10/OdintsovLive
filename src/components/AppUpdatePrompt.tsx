import { useCallback, useEffect, useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import './AppUpdatePrompt.css'

declare const __APP_BUILD_VERSION__: string

interface AppVersionInfo {
  version: string
  builtAt?: string
}

const VERSION_URL = '/app-version.json'
const CHECK_INTERVAL_MS = 2 * 60 * 1000
const SNOOZE_MS = 30 * 60 * 1000
const SNOOZE_STORAGE_KEY = 'app-update-snooze'

function parseVersionInfo(payload: unknown): AppVersionInfo | null {
  if (!payload || typeof payload !== 'object') return null

  const version = String((payload as { version?: unknown }).version || '').trim()
  if (!version) return null

  const builtAt = String((payload as { builtAt?: unknown }).builtAt || '').trim()
  return { version, builtAt: builtAt || undefined }
}

function getSnoozedUntil(version: string): number {
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY)
    if (!raw) return 0

    const parsed = JSON.parse(raw) as { version?: string; until?: number }
    if (parsed.version !== version) return 0

    return typeof parsed.until === 'number' ? parsed.until : 0
  } catch {
    return 0
  }
}

function setSnoozedUntil(version: string, until: number) {
  localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify({ version, until }))
}

function AppUpdatePrompt() {
  const [availableVersion, setAvailableVersion] = useState<AppVersionInfo | null>(null)

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) return

      const nextVersion = parseVersionInfo(await response.json())
      if (!nextVersion) return

      if (nextVersion.version === __APP_BUILD_VERSION__) {
        setAvailableVersion(null)
        return
      }

      if (getSnoozedUntil(nextVersion.version) > Date.now()) return

      setAvailableVersion(nextVersion)
    } catch (error) {
      console.warn('Could not check app version:', error)
    }
  }, [])

  useEffect(() => {
    void checkForUpdate()

    const intervalId = window.setInterval(() => {
      void checkForUpdate()
    }, CHECK_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate()
      }
    }

    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkForUpdate])

  if (!availableVersion) return null

  const handleUpdate = () => {
    localStorage.removeItem(SNOOZE_STORAGE_KEY)
    window.location.reload()
  }

  const handleSnooze = () => {
    setSnoozedUntil(availableVersion.version, Date.now() + SNOOZE_MS)
    setAvailableVersion(null)
  }

  return (
    <div className="app-update-prompt" role="dialog" aria-live="polite" aria-labelledby="app-update-title">
      <div className="app-update-prompt__icon">
        <RefreshCw size={20} />
      </div>
      <div className="app-update-prompt__content">
        <h2 id="app-update-title">Доступна новая версия</h2>
        <p>Обновите страницу, чтобы увидеть последние изменения.</p>
      </div>
      <div className="app-update-prompt__actions">
        <button className="app-update-prompt__button app-update-prompt__button--primary" onClick={handleUpdate}>
          <RefreshCw size={16} />
          <span>Обновить</span>
        </button>
        <button className="app-update-prompt__button" onClick={handleSnooze}>
          <Clock size={16} />
          <span>Позже</span>
        </button>
      </div>
    </div>
  )
}

export default AppUpdatePrompt
