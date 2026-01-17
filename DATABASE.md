# Работа с БД (PostgreSQL на NAS)

## Подключение

```bash
sudo docker exec -it supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres
```

---

## Просмотр схемы

**Список таблиц:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "\dt"
```

**Структура таблицы:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "\d tender_employees"
```

**Все колонки всех таблиц:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;"
```

---

## Выполнение SQL

**Одна команда:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "SELECT * FROM tender_employees LIMIT 5;"
```

**Несколько команд:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "
ALTER TABLE tender_employees ADD COLUMN group_name TEXT;
"
```

---

## Частые операции

**Добавить колонку:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "ALTER TABLE имя_таблицы ADD COLUMN имя_колонки ТИП;"
```

**Удалить колонку:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "ALTER TABLE имя_таблицы DROP COLUMN имя_колонки;"
```

**Выдать права:**
```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "GRANT ALL ON имя_таблицы TO anon, authenticated, service_role;"
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
