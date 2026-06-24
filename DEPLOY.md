# Развёртывание на VDS (FirstVDS)

## Конфигурация

| Параметр        | Значение                            |
|-----------------|-------------------------------------|
| VDS IP          | `80.74.28.233`                      |
| SSH порт        | `22`                                |
| Пользователь    | `root`                              |
| Путь фронтенда  | `/var/www/odintsovlive`             |
| Supabase        | `/opt/supabase`                     |
| Домен           | `odintsovlive.fvds.ru`             |
| PostgreSQL порт | `5433`                              |

---

## Быстрый деплой

```bash
./deploy.sh
```

Скрипт:
- собирает фронтенд;
- загружает `dist` через `tar + ssh`;
- проверяет загрузку.

---

## Работа с БД

### Подключение к PostgreSQL

```bash
ssh root@80.74.28.233 "docker exec -it supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres"
```

### Применение миграции

```bash
scp supabase/migrations/XXX.sql root@80.74.28.233:/tmp/
ssh root@80.74.28.233 "docker exec -i supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres < /tmp/XXX.sql"
```

---

## Supabase стек

```bash
ssh root@80.74.28.233
cd /opt/supabase
docker compose up -d      # запуск
docker compose logs -f     # логи
docker compose down        # остановка
```

---

## Nginx и HTTPS

Конфиг: `/etc/nginx/sites-available/odintsovlive`

```bash
ssh root@80.74.28.233
nginx -t && systemctl reload nginx   # проверка и перезагрузка
certbot renew --dry-run               # проверка обновления сертификата
```

---

## Прежняя конфигурация (Synology NAS)

| Параметр        | Значение                            |
|-----------------|-------------------------------------|
| NAS IP (лок.)   | `192.168.1.11`                      |
| NAS IP (внеш.)  | `195.170.192.192`                   |
| SSH порт        | `24`                                |
| Пользователь    | `odintsov.live`                     |
| Домен           | `odintsovlive.duckdns.org`          |
