# Развёртывание на Synology NAS

## Конфигурация

| Параметр        | Значение                  |
|-----------------|---------------------------|
| NAS IP          | 192.168.1.11              |
| SSH порт        | 24                        |
| Пользователь    | odintsov.live             |
| Домен           | odintsovlive.duckdns.org  |
| PostgreSQL порт | 5433                      |

---

## Деплой фронтенда

```bash
./deploy.sh
```

---

## Ручной деплой

### 1. Билд
```bash
npm run build
```

### 2. Копирование на NAS
```bash
scp -P 24 -r dist/* odintsov.live@192.168.1.11:/volume1/docker/frontend/dist/
```

### 3. Перезапуск контейнера
```bash
ssh -p 24 odintsov.live@192.168.1.11 "sudo docker restart odintsov-frontend"
```

---

## Подключение к NAS

```bash
ssh -p 24 odintsov.live@192.168.1.11
```

---

## Управление контейнерами

### Статус
```bash
sudo docker ps
```

### Логи Supabase
```bash
cd /volume1/docker/supabase && sudo docker-compose logs -f
```

### Логи фронтенда
```bash
sudo docker logs odintsov-frontend
```

### Перезапуск Supabase
```bash
cd /volume1/docker/supabase && sudo docker-compose restart
```

### Перезапуск фронтенда
```bash
sudo docker restart odintsov-frontend
```

---

## Работа с БД

### Подключение к PostgreSQL
```bash
sudo docker exec -it supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres
```

### Выполнение SQL-команды
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "SELECT * FROM calendar_days LIMIT 5;"
```

### Импорт данных
```bash
sudo docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres < /путь/к/файлу.sql
```

---

## Миграция из Supabase Cloud

### Экспорт (на Mac)
```bash
/opt/homebrew/opt/postgresql@17/bin/pg_dump "postgresql://postgres.urryjoaghcwddkjsahli:PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres" --data-only --exclude-schema=auth --exclude-schema=storage --exclude-schema=supabase_functions > /tmp/supabase_data.sql
```

### Копирование на NAS
Через Finder: smb://192.168.1.11 → docker/supabase/

### Импорт
```bash
sudo docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres < /volume1/docker/supabase/supabase_data.sql
```

---

## Структура папок на NAS

```
/volume1/docker/
├── supabase/
│   ├── docker-compose.yml
│   ├── kong.yml
│   ├── .env
│   └── volumes/
│       └── db/
└── frontend/
    ├── docker-compose.yml
    ├── nginx.conf
    └── dist/
```

---

## Troubleshooting

### Ошибка подключения к БД
```bash
sudo docker logs supabase-db
```

### 403 Forbidden на таблицы/views
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "GRANT ALL ON имя_таблицы TO anon, authenticated, service_role;"
```

### Перезапуск всех сервисов
```bash
cd /volume1/docker/supabase && sudo docker-compose restart
sudo docker restart odintsov-frontend
```
