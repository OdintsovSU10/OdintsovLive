# События сотрудников FOT → OdintsovLive

Интеграция использует публичный endpoint FOT:

```text
GET /api/public/v1/employee-events
  ?employee_id=<FOT employee id>
  &from=YYYY-MM-DD
  &to=YYYY-MM-DD
  &limit=1..1000
  &offset=0
```

Endpoint авторизуется обычным Data API-токеном и требует, чтобы ключу была
открыта таблица `skud_events`. Ответ не содержит ФИО и номер пропуска.

## Выпуск ключа

В FOT откройте администрирование Data API и выпустите новый ключ для
OdintsovLive. Сохраните текущие разрешения `employees` и `org_departments`, а
для событий добавьте таблицу `skud_events` с минимальным набором полей:

```text
id
employee_id
event_at
event_date
event_time
access_point
direction
```

После деплоя FOT backend вставьте ключ на
`https://live.meridianai.ru/fot-admin`. Токен хранится только в
`/opt/sites/fot-token-api/data/token` и не должен попадать в репозиторий или
логи.

## Подготовка production sidecar

Файл `prepare-sidecar.mjs` идемпотентно добавляет маршрут
`/fot-api-employee-events`, проверку capability при ротации токена и nginx
location. Без `--apply` скрипт только проверяет возможность обновления.

```bash
scp ops/fot-employee-events/prepare-sidecar.mjs selectel:/tmp/
ssh selectel 'node /tmp/prepare-sidecar.mjs'
```

После отдельного подтверждения production-изменений:

```bash
ssh selectel 'node /tmp/prepare-sidecar.mjs --apply'
ssh selectel 'nginx -t'
ssh selectel 'cd /opt/sites && docker compose up -d --force-recreate web fot-token-api'
```

Single-file bind mounts требуют именно `--force-recreate`; обычный reload не
подхватит новый inode.

## Порядок включения

1. Развернуть FOT backend с новым endpoint.
2. Выпустить FOT Data API-ключ с capability `skud_events`.
3. Обновить токен через `/fot-admin`.
4. Подготовить и перезапустить sidecar + web.
5. Развернуть OdintsovLive SPA.
6. Открыть карточку сотрудника с заполненным `fot_employee_id` и проверить
   помесячную ленту «События СКУД».

До выполнения шагов 1–4 интерфейс корректно покажет ошибку недоступного endpoint
или отсутствующего разрешения; существующие сотрудники и табель не затрагиваются.
