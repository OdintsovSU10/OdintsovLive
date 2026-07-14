# Автосинхронизация табеля FOT

Production использует systemd timer `fot-timesheet-sync.timer`. Раз в минуту он
запускает существующий CLI внутри контейнера `fot-token-api` и обновляет последние
три календарных дня. Токен читается только из `/data/token` внутри контейнера.

FOT API отдаёт автоматические будние часы уже после вычета стандартного часа на
обед. Синхронизация округляет это готовое нетто-время до целого часа и не возвращает
обеденный час повторно.

Файлы на сервере:

- `/opt/sites/fot-token-api/sync-fot-timesheet.mjs`
- `/opt/sites/fot-token-api/run-fot-timesheet-sync.sh`
- `/opt/sites/fot-token-api/sync.env`
- `/etc/systemd/system/fot-timesheet-sync.service`
- `/etc/systemd/system/fot-timesheet-sync.timer`

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
```
