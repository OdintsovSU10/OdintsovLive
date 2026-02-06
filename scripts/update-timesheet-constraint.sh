#!/bin/bash

echo "Обновление constraint для tender_timesheet..."

ssh -p 24 odintsov.live@95.165.99.67 "sudo docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres << 'EOF'
ALTER TABLE tender_timesheet DROP CONSTRAINT IF EXISTS tender_timesheet_status_check;
ALTER TABLE tender_timesheet ADD CONSTRAINT tender_timesheet_status_check CHECK (status IN ('work', 'vacation', 'dayoff', 'remote', 'unpaid', 'absent'));
EOF"

echo "Constraint обновлен!"
