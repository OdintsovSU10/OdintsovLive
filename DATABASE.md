# Работа с БД (PostgreSQL на NAS)

## Подключение

```bash
sudo /usr/local/bin/docker exec -it supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres
```

---

## Просмотр схемы

**Список таблиц:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "\dt"
```

**Структура таблицы:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "\d tender_employees"
```

**Все колонки всех таблиц:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;"
```

---

## Выполнение SQL

**Одна команда:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "SELECT * FROM tender_employees LIMIT 5;"
```

**Несколько команд:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "
ALTER TABLE tender_employees ADD COLUMN group_name TEXT;
"
```

---

## Частые операции

**Добавить колонку:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "ALTER TABLE имя_таблицы ADD COLUMN имя_колонки ТИП;"
```

**Удалить колонку:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "ALTER TABLE имя_таблицы DROP COLUMN имя_колонки;"
```

**Выдать права:**
```bash
sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "GRANT ALL ON имя_таблицы TO anon, authenticated, service_role;"
```

---

## Применение миграции через SSH (рекомендуемый способ)

На этой NAS не работает `scp/sftp subsystem`, поэтому SQL-файл передаём через `ssh ... 'cat > файл'`.

**1) Передать миграцию:**
```bash
ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no \
odintsov.live@95.165.99.67 \
'cat > /tmp/010_expense_tracking.sql' \
< /Users/odintsovlive/Desktop/Project/OdintsovLive/supabase/migrations/010_expense_tracking.sql
```

**2) Применить миграцию (`ssh -tt` обязателен для `sudo`):**
```bash
ssh -tt -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes \
odintsov.live@95.165.99.67 \
'sudo /usr/local/bin/docker exec -i supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/010_expense_tracking.sql'
```

**3) Проверить результат:**
```bash
ssh -tt -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes \
odintsov.live@95.165.99.67 \
'sudo /usr/local/bin/docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "\\dt public.expense_*"'
```

---

## Типы данных

| Тип | Описание |
|-----|----------|
| TEXT | Строка |
| INTEGER | Целое число |
| NUMERIC | Число с плавающей точкой |
| BOOLEAN | true/false |
| DATE | Дата (YYYY-MM-DD) |
| TIMESTAMPTZ | Дата и время с таймзоной |
| SERIAL | Автоинкремент |
