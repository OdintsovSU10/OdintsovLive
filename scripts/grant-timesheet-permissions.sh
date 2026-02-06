#!/bin/bash

echo "Выдача прав на tender_timesheet..."

# Удалённое применение (на NAS)
ssh -p 24 odintsov.live@95.165.99.67 "sudo docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres << 'EOF'
GRANT ALL ON tender_timesheet TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE tender_timesheet_id_seq TO anon, authenticated, service_role;
EOF"

echo "Перезапуск PostgREST..."
ssh -p 24 odintsov.live@95.165.99.67 "sudo docker restart supabase-rest"

echo "Права выданы, PostgREST перезапущен!"
