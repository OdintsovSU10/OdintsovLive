import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createFotApiTableUrl(fotApi: string, tableName: string): string {
  try {
    const url = new URL(fotApi.trim())
    const parts = url.pathname.split('/')
    const tablesIndex = parts.lastIndexOf('tables')

    if (tablesIndex >= 0) {
      url.pathname = [...parts.slice(0, tablesIndex + 1), tableName].join('/')
      url.search = ''
      return url.toString()
    }
  } catch {
    return ''
  }

  return ''
}

function createFotApiProxy(fotApi: string, fotApiToken?: string, proxyPath = '/fot-api'): ProxyOptions | null {
  const trimmedApi = fotApi.trim()
  if (!trimmedApi) return null
  const stripProxyPath = new RegExp(`^${escapeRegExp(proxyPath)}\\/?`)

  try {
    const url = new URL(trimmedApi)
    const targetPath = url.pathname.replace(/\/$/, '')
    const targetSearch = url.search

    return {
      target: url.origin,
      changeOrigin: true,
      secure: false,
      headers: fotApiToken ? { Authorization: `Bearer ${fotApiToken}` } : undefined,
      rewrite: (path) => {
        const [rawPath, requestSearch = ''] = path.split('?')
        const suffix = rawPath.replace(stripProxyPath, '')
        const nextPath = suffix ? `${targetPath}/${suffix}` : targetPath || '/'
        const searchParams = new URLSearchParams(targetSearch)
        new URLSearchParams(requestSearch).forEach((value, key) => {
          searchParams.set(key, value)
        })
        const mergedSearch = searchParams.toString()

        return `${nextPath}${mergedSearch ? `?${mergedSearch}` : ''}`
      }
    }
  } catch {
    return {
      target: trimmedApi,
      changeOrigin: true,
      secure: false,
      headers: fotApiToken ? { Authorization: `Bearer ${fotApiToken}` } : undefined,
      rewrite: (path) => path.replace(new RegExp(`^${escapeRegExp(proxyPath)}`), '') || '/'
    }
  }
}

function createAppVersionPlugin(buildVersion: string, builtAt: string): Plugin {
  const versionPayload = JSON.stringify({ version: buildVersion, builtAt }, null, 2)

  return {
    name: 'odintsov-app-version',
    configureServer(server) {
      server.middlewares.use('/app-version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        res.end(versionPayload)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app-version.json',
        source: versionPayload
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const builtAt = new Date().toISOString()
  const buildVersion = `${mode}-${builtAt}`
  const fotApiProxy = createFotApiProxy(env.FOT_API || '', env.FOT_API_TOKEN)
  const fotDepartmentsApi = env.FOT_API ? createFotApiTableUrl(env.FOT_API, 'org_departments') : ''
  const fotDepartmentsProxy = createFotApiProxy(fotDepartmentsApi, env.FOT_API_TOKEN, '/fot-api-departments')
  const fotTimesheetApi = env.FOT_TIMESHEET_API || 'https://fot.su10.ru/api/public/v1/timesheet'
  const fotTimesheetProxy = createFotApiProxy(fotTimesheetApi, env.FOT_API_TOKEN, '/fot-api-timesheet')

  return {
    plugins: [react(), createAppVersionPlugin(buildVersion, builtAt)],
    define: {
      __APP_BUILD_VERSION__: JSON.stringify(buildVersion)
    },
    server: {
      proxy: {
        '/auth/v1': {
          target: 'https://odintsovlive.fvds.ru',
          changeOrigin: true,
          secure: false
        },
        '/rest/v1': {
          target: 'https://odintsovlive.fvds.ru',
          changeOrigin: true,
          secure: false
        },
        '/storage/v1': {
          target: 'https://odintsovlive.fvds.ru',
          changeOrigin: true,
          secure: false
        },
        ...(fotTimesheetProxy ? { '/fot-api-timesheet': fotTimesheetProxy } : {}),
        ...(fotDepartmentsProxy ? { '/fot-api-departments': fotDepartmentsProxy } : {}),
        ...(fotApiProxy ? { '/fot-api': fotApiProxy } : {})
      }
    }
  }
})
