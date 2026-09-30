# Распознавание показаний счётчиков (домашний ПК)

Портал кладёт сжатое фото в таблицу `meter_ocr_jobs` (Supabase). Воркер на домашнем ПК
(`ssh home`, Windows 10) сам забирает задания, распознаёт их локальной моделью через Ollama
и записывает результат обратно. Портал подставляет показания в месяц аренды.
Порты наружу не открываются: домашний ПК только ходит на `https://live.meridianai.ru`.

```
браузер ── JPEG ≤1280px ──► meter_ocr_jobs (pending)
                                   │  опрос раз в 5 с
                     воркер (home) ◄┘
                     Ollama qwen3-vl:4b-instruct (CPU)
                                   │
            result (done), фото ──► C:\meter-ocr\photos\<ГГГГ-ММ>\<id>.jpg
                                   │  image_base64 = null
браузер ◄── опрос раз в 4 с ───────┘
```

## Файлы на home (`C:\meter-ocr`)

| Путь | Что это |
|------|---------|
| `ollama\` | Ollama standalone (CLI, без трея) |
| `node\` | Node.js LTS portable |
| `models\` | модели Ollama (`OLLAMA_MODELS`) |
| `worker.mjs` | воркер, без зависимостей |
| `start.cmd` | запускает `ollama serve` и воркер |
| `.env` | настройки воркера (см. `.env.example`) |
| `photos\` | сжатые копии фото после распознавания |
| `logs\` | `ollama.log`, `worker.log` |

Автозапуск — задача планировщика `MeterOcr` (при старте системы, от SYSTEM,
перезапуск при сбое).

## Установка / обновление

```bash
ssh home 'mkdir C:\meter-ocr'
scp ops/meter-ocr-worker/install.ps1 ops/meter-ocr-worker/worker.mjs ops/meter-ocr-worker/.env.example home:C:/meter-ocr/
sed 's/$/\r/' ops/meter-ocr-worker/start.cmd > /tmp/start.cmd && scp /tmp/start.cmd home:C:/meter-ocr/start.cmd
ssh home 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\meter-ocr\install.ps1'
ssh home 'powershell -NoProfile -Command "Start-ScheduledTask MeterOcr"'
ssh home 'C:\meter-ocr\ollama\ollama.exe pull qwen3-vl:4b-instruct'
```

`.env` заполняется вручную на home: `copy .env.example .env`, вписать `SUPABASE_KEY`
(тот же publishable/anon-ключ, что у портала). Ключ в чат и в git не попадает.

Перезапуск после обновления `worker.mjs` / `start.cmd`:

```powershell
Stop-ScheduledTask MeterOcr
Get-Process | Where-Object { $_.Path -like 'C:\meter-ocr\*' } | Stop-Process -Force
Start-ScheduledTask MeterOcr
```

## GPU

GTX 750 Ti (2 ГБ, Maxwell) не подходит: CUDA-сборка Ollama её не поддерживает,
на Vulkan падает CLIP-энкодер. В `start.cmd` GPU отключены (`CUDA_VISIBLE_DEVICES=-1`,
`OLLAMA_VULKAN=0`), модель считает на CPU (i7-4790, 32 ГБ): ~80–90 с на фото.

Модель — именно `qwen3-vl:4b-instruct`. Тег `qwen3-vl:4b` — thinking-вариант:
игнорирует `think: false`, тратит тысячи токенов на рассуждения и не укладывается в лимит.

## Проверка

```powershell
C:\meter-ocr\node\node.exe C:\meter-ocr\worker.mjs --test C:\path\photo.jpg
Get-Content C:\meter-ocr\logs\worker.log -Tail 20
```

## Как считается

- Электросчётчик показывает один тариф за раз — каждый тариф (T1, T2, T3) отдельным фото.
- Водомеры одинаковые: ХВС/ГВС определяются по прошлому месяцу (показания не убывают),
  если оба варианта возможны — слева ХВС, справа ГВС.
- Вода считается в целых м³ (литры переносятся на следующий месяц).
- Водоотведение = расход ХВС + расход ГВС.
- Тарифы вводятся на странице месяца и подставляются из прошлого месяца.
