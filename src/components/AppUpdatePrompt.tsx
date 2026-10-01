import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import './AppUpdatePrompt.css'

declare const __APP_BUILD_VERSION__: string

interface AppVersionInfo {
  version: string
  builtAt?: string
}

const VERSION_URL = '/app-version.json'
const CHECK_INTERVAL_MS = 2 * 60 * 1000

function parseVersionInfo(payload: unknown): AppVersionInfo | null {
  if (!payload || typeof payload !== 'object') return null

  const version = String((payload as { version?: unknown }).version || '').trim()
  if (!version) return null

  const builtAt = String((payload as { builtAt?: unknown }).builtAt || '').trim()
  return { version, builtAt: builtAt || undefined }
}

function AppUpdatePrompt() {
  const location = useLocation()
  const [availableVersion, setAvailableVersion] = useState<AppVersionInfo | null>(null)
  const [updateTarget, setUpdateTarget] = useState<HTMLElement | null>(null)

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

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setUpdateTarget(document.getElementById('tender-tab-status'))
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [availableVersion, location.pathname])

  if (!availableVersion) return null

  const handleUpdate = () => {
    window.location.reload()
  }

  const updateButton = (
    <button
      type="button"
      className={`app-update-prompt ${updateTarget ? 'app-update-prompt--inline' : ''}`}
      onClick={handleUpdate}
      aria-label="Доступна новая версия. Обновить страницу"
      title="Доступна новая версия — нажмите, чтобы обновить"
    >
      <RefreshCw size={16} aria-hidden="true" />
      <span className="app-update-prompt__dot" aria-hidden="true" />
    </button>
  )

  return updateTarget ? createPortal(updateButton, updateTarget) : updateButton
}

export default AppUpdatePrompt
