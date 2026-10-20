# Автосинхронизация табеля FOT

Production использует systemd timer `fot-timesheet-sync.timer`. Раз в минуту он
запускает существующий CLI внутри контейнера `fot-token-api` и обновляет последние
три календарных дня. Токен читается только из `/data/token` внутри контейнера.

Корректировки в FOT часто делают позже трёх дней, поэтому второй timer
`fot-timesheet-sync-months.timer` раз в час перечитывает период с первого числа
прошлого месяца по сегодня (`run-fot-timesheet-sync.sh months`). Разово любой
период можно перечитать, передав скрипту `--from YYYY-MM-DD --to YYYY-MM-DD`.

## СКУД по дням

Флаг `--skud` добавляет этап «СКУД по дням»: для сотрудников с `fot_employee_id`
из синка загружаются события СКУД (`/api/public/v1/employee-events`), считаются
перерывы и время вне офиса (та же логика, что `calculateFotSkudDay` на фронте) и
пишутся в таблицу `tender_skud_daily` (миграция `039_tender_skud_daily.sql`,
ключ `employee_id + work_date`; дни без событий не хранятся). По умолчанию флаг
выключен, поэтому минутный `recent` FOT за событиями не ходит; режим `months`
(раз в час) запускается с `--skud`.

Разовое наполнение истории (последние 185 дней) после применения миграции:

```bash
/opt/sites/fot-token-api/run-fot-timesheet-sync.sh skud-backfill
```

FOT API отдаёт автоматические будние часы уже после вычета стандартного часа на
обед. Синхронизация округляет это готовое нетто-время до целого часа и не возвращает
обеденный час повторно.

Файлы на сервере:

- `/opt/sites/fot-token-api/sync-fot-timesheet.mjs`
- `/opt/sites/fot-token-api/run-fot-timesheet-sync.sh`
- `/opt/sites/fot-token-api/sync.env`
- `/etc/systemd/system/fot-timesheet-sync.service`
- `/etc/systemd/system/fot-timesheet-sync.timer`
- `/etc/systemd/system/fot-timesheet-sync-months.service`
- `/etc/systemd/system/fot-timesheet-sync-months.timer`

`sync.env` не содержит секретов. В нём задаются:

```ini
FOT_TIMESHEET_DEPARTMENT_IDS=<department UUIDs separated by commas>
FOT_TIMESHEET_LOOKBACK_DAYS=3
```

Без `FOT_TIMESHEET_DEPARTMENT_IDS` синхронизация намеренно не запускается, чтобы
таймер не запрашивал сотрудников всех подразделений FOT.

Проверка:

```bash
systemctl status fot-timesheet-sync.timer
journalctl -u fot-timesheet-sync.service -n 50 --no-pager
systemctl status fot-timesheet-sync-months.timer
journalctl -u fot-timesheet-sync-months.service -n 50 --no-pager
```
