#!/usr/bin/env node

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const DEFAULT_SIDECAR_PATH = '/opt/sites/fot-token-api/server.mjs'
const DEFAULT_NGINX_PATH = '/opt/sites/odintsovlive-fot-api.conf'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const positional = args.filter(arg => arg !== '--apply')
const sidecarPath = positional[0] || DEFAULT_SIDECAR_PATH
const nginxPath = positional[1] || DEFAULT_NGINX_PATH

function replaceOnce(source, oldValue, newValue, label) {
  if (source.includes(newValue)) return source
  const firstIndex = source.indexOf(oldValue)
  if (firstIndex < 0 || source.indexOf(oldValue, firstIndex + oldValue.length) >= 0) {
    throw new Error(`Не найден однозначный фрагмент для изменения: ${label}`)
  }
  return source.slice(0, firstIndex) + newValue + source.slice(firstIndex + oldValue.length)
}

function patchSidecar(source) {
  let result = replaceOnce(
    source,
    "// 1) Проксирует /fot-api, /fot-api-departments, /fot-api-timesheet → FOT\n",
    "// 1) Проксирует /fot-api, /fot-api-departments, /fot-api-timesheet и\n//    /fot-api-employee-events → FOT\n",
    'описание маршрутов sidecar'
  )

  result = replaceOnce(
    result,
    "  '/fot-api-timesheet': '/api/public/v1/timesheet',\n};",
    "  '/fot-api-timesheet': '/api/public/v1/timesheet',\n  '/fot-api-employee-events': '/api/public/v1/employee-events',\n};",
    'маршрут employee-events в PROXY_ROUTES'
  )

  result = replaceOnce(
    result,
    "// Проверка токена против FOT: employees должен дать 200;\n// timesheet без параметров легитимно даёт 400 (=auth прошёл), 401/403 = плохо.\n",
    "// Проверка токена против FOT: employees должен дать 200;\n// расчётные endpoints без параметров легитимно дают 400 (=auth прошёл),\n// 401/403 означают невалидный токен или отсутствующую capability.\n",
    'описание проверки токена'
  )

  result = replaceOnce(
    result,
    "  try {\n    out.timesheet = (await fotFetch('/api/public/v1/timesheet', token)).status;\n  } catch { out.timesheet = 0; }\n  out.ok = out.employees === 200 && out.timesheet !== 401 && out.timesheet !== 403;",
    "  try {\n    out.timesheet = (await fotFetch('/api/public/v1/timesheet', token)).status;\n  } catch { out.timesheet = 0; }\n  try {\n    out.events = (await fotFetch('/api/public/v1/employee-events', token)).status;\n  } catch { out.events = 0; }\n  out.ok = out.employees === 200\n    && out.timesheet !== 401 && out.timesheet !== 403\n    && out.events !== 401 && out.events !== 403 && out.events !== 404;",
    'проверка доступа токена к событиям'
  )

  result = replaceOnce(
    result,
    "    return 'ФОТ: сотрудники '+(c.employees===200?'✓':'✗ HTTP '+c.employees)\n      +', табель '+((c.timesheet&&c.timesheet!==401&&c.timesheet!==403)?'✓':'✗ HTTP '+c.timesheet);",
    "    return 'ФОТ: сотрудники '+(c.employees===200?'✓':'✗ HTTP '+c.employees)\n      +', табель '+((c.timesheet&&c.timesheet!==401&&c.timesheet!==403)?'✓':'✗ HTTP '+c.timesheet)\n      +', события '+((c.events&&c.events!==401&&c.events!==403&&c.events!==404)?'✓':'✗ HTTP '+c.events);",
    'статус событий в /fot-admin'
  )

  result = replaceOnce(
    result,
    "  <p class=\"sub\">Табели, сотрудники и отделы на портале загружаются из ФОТ по этому токену.\n",
    "  <p class=\"sub\">Табели, сотрудники, отделы и события СКУД загружаются из ФОТ по этому токену.\n",
    'описание токена в /fot-admin'
  )

  return result
}

const EVENTS_LOCATION = `location = /fot-api-employee-events {
    auth_request /fot-api-auth;
    error_page 401 403 = @fot_unauthorized;
    set $fot_sidecar_events fot-token-api:8080;
    proxy_pass http://$fot_sidecar_events$request_uri;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

`

function patchNginx(source) {
  if (source.includes('location = /fot-api-employee-events {')) return source
  const anchor = '# Страница управления токеном.'
  return replaceOnce(source, anchor, EVENTS_LOCATION + anchor, 'nginx location для employee-events')
}

function prepareFile(path, patcher) {
  const current = readFileSync(path, 'utf8')
  const next = patcher(current)
  return { path, current, next, changed: current !== next }
}

const prepared = [
  prepareFile(sidecarPath, patchSidecar),
  prepareFile(nginxPath, patchNginx)
]

for (const file of prepared) {
  console.log(`${file.changed ? 'нужно обновить' : 'уже готово'}: ${file.path}`)
}

if (!apply) {
  console.log('Проверка завершена без записи. Для применения добавьте --apply.')
  process.exit(0)
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
for (const file of prepared) {
  if (!file.changed) continue
  copyFileSync(file.path, `${file.path}.bak-${timestamp}`)
  writeFileSync(file.path, file.next, 'utf8')
  console.log(`обновлено: ${file.path}`)
}

console.log('Файлы подготовлены. Выполните nginx -t и пересоздайте web + fot-token-api по DEPLOY.md.')
