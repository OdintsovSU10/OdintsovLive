# Деплой live.meridianai.ru

Инструкция для правильного и безопасного деплоя сайта **live.meridianai.ru**.
Сервер многосайтовый — рядом живут другие сервисы, ломать их нельзя.

> Это отдельный сайт (odintsovlive, SPA + Supabase), **не** приложение Meridian.
> Инфра-файлы портала: репозиторий `odintsovlive-infra/` (рядом с инфрой).

---

## TL;DR

1. Собрать SPA **локально**: `npm run build` → `dist/`.
2. Убедиться, что в бандле `supabaseUrl = https://live.meridianai.ru`.
3. Залить статику: `./deploy.sh` (только статика, Supabase не трогаем).
4. Проверить: `curl -I https://live.meridianai.ru` → `200`, залогиниться в браузере.
5. **Сборку на сервере НЕ делать** (1 vCPU / 1.9 ГБ — задушит соседей).

Контейнер перезапускать не нужно — статика читается bind-mount'ом на лету.

---

## Что такое live.meridianai.ru

Это **не** приложение Meridian (FastAPI). Это отдельный сайт **odintsovlive**:
статичный SPA + бэкенд на Supabase. Живёт на сервере **Selectel** за infra-nginx,
внешний доступ идёт через реверс-прокси YC.

`ssh selectel` → `root@135.106.162.110` (Ubuntu 24.04, 1 vCPU / 1.9 ГБ).

Карта компонентов:

| Компонент          | Путь на сервере                       | Контейнер / сервис                     |
|--------------------|---------------------------------------|----------------------------------------|
| SPA-статика        | `/opt/sites/odintsovlive/`            | `odintsovlive-web` (`nginx:1.27-alpine`) |
| Compose портала    | `/opt/sites/docker-compose.yml`       | project `odintsovlive`                 |
| Supabase (БД/API)  | `/opt/supabase/`                      | db / auth / rest / kong (`:8000`)      |
| FOT-табели sidecar | `/opt/sites/fot-token-api/`           | `fot-token-api` (node)                 |
| Внешний edge (TLS) | YC `89.169.191.175` `yc-sites.conf`   | → `https://135.106.162.110`            |

Сети Docker: `infra_web` (внешний ingress) + `supabase-network` (бэкенд). Обе `external`.
Инфра-файлы портала: репозиторий `odintsovlive-infra/` (рядом с инфрой).

---

## 1. Частый путь — пере-деплой фронта (90% случаев)

Перед стартом убедись, что SSH alias `selectel` настроен:
`ssh selectel 'echo ok'` должен вернуть `ok`.

### 1.1 Сборка (локально, в оригинальном проекте SPA)

```bash
npm run build  # → dist/
```

`deploy.sh` ожидает, что правильный `supabaseUrl` будет зашит в бандл при билде
(через `VITE_SUPABASE_URL` в `.env`).

⚠️ **Перед сборкой** проверь, что Supabase URL зашит правильный:
`https://live.meridianai.ru` (раньше был `odintsovlive.fvds.ru`). Задавать через
`.env` / `VITE_*`, а не хардкодом. На сервере sub_filter убран — подмены URL на лету НЕТ.
Supabase при этом **работает локально на сервере** (`/opt/supabase/`) — порталу
нужен только правильный внешний URL в bundle.

### 1.2 Заливка на сервер

```bash
# по умолчанию:
#   SSH_TARGET=selectel
#   REMOTE_PATH=/opt/sites/odintsovlive
#   DIST_DIR=dist
# опционально:
#   SKIP_BACKUP=1   # без бэкапа на сервере
#   SKIP_VERIFY=1  # без curl-проверок
./deploy.sh
```

- `index.html` отдаётся с `no-cache` → новая версия подхватывается сразу.
- Ассеты `/assets/*` имеют хеш в имени и immutable-кэш — коллизий нет.
- **Рестарт контейнера не нужен** (bind-mount читается на лету).

### 1.3 Проверка — см. §4.

---

## 2. Редкий путь — infra / nginx / compose / sidecar

Файлы лежат в `odintsovlive-infra/` и bind-mount'ятся в контейнеры **по одному файлу**.

```bash
scp odintsovlive-fot-api.conf selectel:/opt/sites/
scp docker-compose.yml        selectel:/opt/sites/
ssh selectel 'cd /opt/sites && docker compose up -d --force-recreate web'   # или fot-token-api / su10info
```

⚠️ **Single-file bind mount** → после правки файла нужен `--force-recreate`
контейнера. `nginx -s reload` НЕ увидит новый inode (частая причина «правки не применились»).

`nginx`-конфиг (`odintsovlive-fot-api.conf`) проксирует к Supabase kong с `$request_uri`
— не менять на `/auth/v1/` и т.п., иначе теряется хвост пути.

**FOT-токен (секрет):**
- НЕ хардкодить в nginx-конфиге. Токен хранится в `/opt/sites/fot-token-api/data/token` (`0600`).
- Ротация — через страницу `https://live.meridianai.ru/fot-admin` (доступ по `profiles.is_admin`).
- Значение токена не выводить в чат, логи, коммиты, скриншоты.

---

## 3. Полный рантайм (справочно — трогать редко)

| Действие                     | Команда                                                        |
|------------------------------|---------------------------------------------------------------|
| Поднять/пере-поднять Supabase| `ssh selectel 'cd /opt/supabase && docker compose up -d'`     |
| Поднять портал odintsovlive  | `ssh selectel 'cd /opt/sites && docker compose up -d'`        |
| Логи контейнера              | `ssh selectel 'docker logs --tail=100 odintsovlive-web'`      |

**НЕ трогать** (соседи на том же сервере):
- Remnawave-панель: `dash.meridianai.ru`, `sub.meridianai.ru` (`/opt/remnawave`).
- Приложение Meridian: `meridianai.ru` (`/opt/portals/meridian`) — деплоится отдельно.
- infra-nginx `/opt/infra/nginx`, Supabase-данные (`/opt/supabase/volumes/db/data`).

---

## 4. Верификация e2e (публично, без секретов)

```bash
curl -I https://live.meridianai.ru                  # → 200, свежий index.html
curl  https://live.meridianai.ru/auth/v1/health     # → 200
```

Затем в браузере:
- Реальный логин email+пароль (JWT_SECRET прежний → старые сессии живы).
- Данные грузятся (`/rest/v1/...` не отдаёт 502).
- Раздел ФОТ / табели открывается. Проблема с токеном → `/fot-admin` (статус токена).

Соседи не задеты:
```bash
curl -I https://meridianai.ru       # → 200
curl -I https://dash.meridianai.ru  # → 200
```

---

## 5. Безопасность и «не сломать соседей»

- Деплой **portal-scoped**: всегда project `odintsovlive` (`/opt/sites/docker-compose.yml`).
- **Запрещено:** `docker system prune -a`, `docker compose down --volumes`,
  `docker stop $(docker ps -q)`, `rm -rf /opt/sites/*`, `rm -rf /opt/supabase/*`.
- Сборка — только локально; на сервере только заливка статики + `up -d`.
- Секреты (токены, пароли, ANON/SERVICE ключи, presigned URL) не печатать и не коммитить.

---

## 6. Откат

- **Фронт:** вернуть предыдущую статику из бэкапа
  `ssh selectel 'rsync -az --delete /opt/sites/odintsovlive.bak-<ts>/ /opt/sites/odintsovlive/'`.
- **Внешний edge (YC):** бэкап конфига `yc-sites.conf.bak-livecutover-*` на `89.169.191.175`.
- **Данные Supabase** не трогаются при деплое фронта — откат касается только статики/конфигов.
