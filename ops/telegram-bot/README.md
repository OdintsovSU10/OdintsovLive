# Telegram-бот личного учёта

Пишешь боту как есть («заправился 40 л по 62.5, пробег 123456», «кофе 350», «вес 82.4»)
или кидаешь фото чека. Нейронка через OpenRouter раскладывает запись по таблицам,
сайт только показывает. Под каждой записью — кнопка «↩️ Отменить».

```
Telegram ──getUpdates──► odintsovlive-bot (quantor, node:24-alpine)
                           ├─ OpenRouter chat/completions + tools
                           └─ https://live.meridianai.ru/rest/v1 (service role)
```

Бот живёт на `quantor`, а не на Selectel: с Selectel Telegram API заблокирован,
OpenRouter отвечает 403. На `quantor` трафик к ним идёт через туннель AmneziaWG (`awg0`).

Голосовые расшифровывает ElevenLabs Scribe (`scribe_v2`), затем текст разбирается как обычный.
ElevenLabs блокирует РФ — его запросы идут через tinyproxy на nl3 (`194.37.81.38:18443`,
IP `quantor` в `Allow`, домен в `/etc/tinyproxy/filter.conf`); см. `environment` в `docker-compose.yml`.

| Инструмент | Куда пишет |
|---|---|
| `add_purchase` | `expense_transactions` |
| `add_fuel` | `car_fuel` + `expense_transactions` |
| `add_car_service` | `car_maintenance` / `car_expenses` + `expense_transactions`, если есть сумма |
| `add_weight` | `body_weight` |
| `add_body_params` | `body_params` |

Траты из бота — `source='telegram'`. При импорте выписки на странице «Траты» банковская
операция с той же суммой (±1 ₽) и датой (±2 дня) склеивается с записью бота:
дубля нет, текст из бота остаётся в `note`.

Каждое сообщение пишется в `telegram_bot_entries` (что создано — для отмены).
Фото чеков — только на диске: `data/receipts/<ГГГГ-ММ>/<entry>.jpg`.

## Файлы

| Файл | Что это |
|---|---|
| `bot.mjs` | опрос Telegram, диалог, отмена, режим `--test` |
| `llm.mjs` | промпт и инструменты для OpenRouter |
| `actions.mjs` | запись в Supabase и отмена |
| `.env` | доступ к Supabase и часовой пояс (см. `.env.example`) |

Зависимостей нет, нужен Node 22+.

## Настройки

Ключи задаются в портале: **Админка → Telegram-бот** (таблица `bot_settings`,
доступ только через функции `get_bot_settings` / `set_bot_settings` с проверкой `is_admin`).
Секреты в браузер не возвращаются. Бот перечитывает настройки раз в минуту и пишет туда
`last_seen_at`, `bot_username`, `last_error` — по ним вкладка показывает, жив ли бот.

- Токен — у @BotFather.
- Telegram id владельца — можно оставить пустым: бот ответит «Нет доступа. Твой Telegram id: N».
- Записи бота привязываются к аккаунту портала, который сохранил настройки.

В `.env` на сервере только доступ к базе (см. `.env.example`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (из `/opt/supabase/.env`), `TZ`. Ключи бота в `.env` — запасной вариант.

## Проверка разбора без записи

```bash
cd ops/telegram-bot
node bot.mjs --test "заправился 40л по 62.5 пробег 123456" "кофе 350 и круассан 200" чек.jpg
```

## Деплой (quantor)

```bash
ssh quantor 'mkdir -p /opt/odintsovlive-bot'
scp ops/telegram-bot/*.mjs ops/telegram-bot/docker-compose.yml ops/telegram-bot/.env.example quantor:/opt/odintsovlive-bot/
ssh quantor 'cd /opt/odintsovlive-bot && cp -n .env.example .env && chmod 600 .env'
# заполнить .env на сервере вручную
ssh quantor 'cd /opt/odintsovlive-bot && docker compose up -d'
ssh quantor 'docker logs --tail=50 odintsovlive-bot'
```

Обновление кода: `scp` файлов `*.mjs` и `ssh quantor 'docker restart odintsovlive-bot'`.
Чеки — в `/opt/odintsovlive-bot/data/receipts/`.
