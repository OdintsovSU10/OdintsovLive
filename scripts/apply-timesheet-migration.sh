#!/bin/bash

echo "Применение миграции tender_timesheet..."

# Локальное применение (если БД доступна локально)
# docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres < supabase/migrations/001_tender_timesheet.sql

# Удалённое применение (на NAS)
ssh -p 24 odintsov.live@192.168.1.11 "cat > /tmp/001_tender_timesheet.sql" < supabase/migrations/001_tender_timesheet.sql
ssh -p 24 odintsov.live@192.168.1.11 "sudo docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres < /tmp/001_tender_timesheet.sql"
ssh -p 24 odintsov.live@192.168.1.11 "rm /tmp/001_tender_timesheet.sql"

echo "Миграция применена!"
