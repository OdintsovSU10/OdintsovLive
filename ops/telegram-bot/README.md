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

Голосовые расшифровывает ElevenLabs Scribe (`scribe_v2`, ключ в Админке), затем текст разбирается как
обычный. Запасной — Deepgram (`nova-3`): без ключа ElevenLabs или при его ошибке. Ключ — `DEEPGRAM_API_KEY`
в `.env` бота, модель и язык — `DEEPGRAM_MODEL`, `DEEPGRAM_LANGUAGE`.
ElevenLabs блокирует РФ — его запросы идут через tinyproxy на nl3 (`194.37.81.38:18443`,
IP `quantor` в `Allow`, домен в `/etc/tinyproxy/filter.conf`); см. `environment` в `docker-compose.yml`.

| Инструмент | Куда пишет |
|---|---|
| `add_purchase` | `expense_transactions` |
| `add_salary` | `salary_payments` (месяц, за который зарплата; в траты не дублируется) |
| `add_fuel` | `car_fuel` + `expense_transactions` |
| `add_car_service` | `car_maintenance` / `car_expenses` + `expense_transactions`, если есть сумма |
| `add_weight` | `body_weight` |
| `add_body_params` | `body_params` |
| `meter_photo` | `meter_ocr_jobs` (готовое задание; показания в месяц подставляет «Аренда») |

**Счётчики.** Фото счётчиков распознаёт `google/gemini-3.1-flash-lite` (`meters.mjs`, выбрана
сравнением на настоящих фото: 24/24, ~2,5 с). Бот же разбирает очередь `meter_ocr_jobs` с портала
(раньше — Ollama на домашнем ПК, 80–90 с). Фото после распознавания — только на диске: `data/meters/`.

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
| `menu.mjs` | кнопки меню и их действия |
| `actions.mjs` | запись в Supabase и отмена |
| `meters.mjs` | распознавание счётчиков и очередь `meter_ocr_jobs` |
| `statement.mjs` | импорт CSV-выписки банка, присланной файлом (те же `dedupe_key`/`row_hash`, что в браузерном импорте; XLSX — только на сайте) |
| `reminders.mjs` | напоминания владельцу с 10:00 до 21:00: выписка не обновлялась 7+ дней (повтор раз в 3 дня); сюда же добавляются новые проверки |
| `merchants.mjs` | раз в 5 минут размечает новых мерчантов банковских операций (название + категория) в `expense_merchant_rules`; правки пользователя (`source='user'`) не трогает |
| `tgUser.mjs`, `tgLogin.mjs` | чтение закрытых для веба каналов через аккаунт Telegram (MTProto) и разовый вход в него |
| `.env` | доступ к Supabase и часовой пояс (см. `.env.example`) |

Нужен Node 22+. Зависимость одна — `telegram` (GramJS), и только для каналов, закрытых для веба (см. ниже); без неё бот работает.

## Настройки

Ключи задаются в портале: **Админка → Telegram-бот** (таблица `bot_settings`,
доступ только через функции `get_bot_settings` / `set_bot_settings` с проверкой `is_admin`).
Секреты в браузер не возвращаются. Бот перечитывает настройки раз в минуту и пишет туда
`last_seen_at`, `bot_username`, `last_error` — по ним вкладка показывает, жив ли бот.

- Токен — у @BotFather.
- Telegram id владельца — можно оставить пустым: бот ответит «Нет доступа. Твой Telegram id: N».
- Записи бота привязываются к аккаунту портала, который сохранил настройки.

В `.env` на сервере только доступ к базе (см. `.env.example`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (из `/opt/supabase/.env`), `TZ` и ключ Deepgram. Остальные ключи бота
в `.env` — запасной вариант. `.env` читается при старте: после правки — `docker restart odintsovlive-bot`.

## Меню

Постоянная клавиатура внизу чата (`menu.mjs`, показывается на `/start`, `/menu`, `/help`). Кнопки записи
(«Трата», «Доход», «Заправка», «Авто», «Вес», «Дело») включают режим: нейронке уходит подсказка, каким инструментом
записать следующее сообщение. Режим хранится в памяти (`chat.mode`), снимается после записи, другой кнопкой,
`/start` или через 10 минут без сообщений. «Счётчики» — режим без нейронки: каждое фото сразу идёт в `meter_photo`,
режим остаётся, пока не нажмёшь другую кнопку. «Дела», «Бюджет», «Аренда» — готовые вопросы, «Недели» и «Помощь» — `/weeks` и `/help`.

## Проверка разбора без записи

```bash
cd ops/telegram-bot
node bot.mjs --test "заправился 40л по 62.5 пробег 123456" "кофе 350 и круассан 200" чек.jpg
```

## Закрытые для веба каналы

Новости читаются с `https://t.me/s/<канал>`. У части каналов (например @cybers) веб-просмотр закрыт: страница
переадресует на `t.me/<канал>`, и в «Каналах» стоит ошибка «Telegram не показывает ленту … в веб-версии».
Такие каналы бот читает через твой пользовательский аккаунт Telegram (MTProto, GramJS); остальные — по-старому через веб,
аккаунт нужен только как запасной путь. Аккаунт должен видеть канал (публичный открывается и без подписки).

1. `api_id` и `api_hash`: https://my.telegram.org → API development tools (создать приложение, название любое).
2. Пакет на сервере (один раз и после смены `package.json`):
   `docker run --rm -v /opt/odintsovlive-bot:/app -w /app node:24-alpine npm ci --omit=dev`
3. GramJS ест память — лимит контейнера 256m; применить: `cd /opt/odintsovlive-bot && docker compose up -d`.
4. Вход (один раз, в интерактивном терминале): `docker exec -it odintsovlive-bot node tgLogin.mjs`
   — спросит api_id, api_hash, телефон (+7…), код из Telegram и пароль двухэтапной проверки, если он включён.
5. Сессия сохраняется в `data/tg-user.json` (права 600, в git не попадает). Перезапуск бота не нужен — файл
   проверяется при каждом сборе новостей. Слетел вход — в «Каналах» будет ошибка, запусти `tgLogin.mjs` заново.

## Деплой (quantor)

```bash
ssh quantor 'mkdir -p /opt/odintsovlive-bot'
scp ops/telegram-bot/*.mjs ops/telegram-bot/package.json ops/telegram-bot/package-lock.json ops/telegram-bot/docker-compose.yml ops/telegram-bot/.env.example quantor:/opt/odintsovlive-bot/
ssh quantor 'cd /opt/odintsovlive-bot && cp -n .env.example .env && chmod 600 .env'
# заполнить .env на сервере вручную
ssh quantor 'cd /opt/odintsovlive-bot && docker compose up -d'
ssh quantor 'docker logs --tail=50 odintsovlive-bot'
```

Обновление кода: `scp` файлов `*.mjs` и `ssh quantor 'docker restart odintsovlive-bot'`.
Чеки — в `/opt/odintsovlive-bot/data/receipts/`, фото счётчиков — в `data/meters/`.
