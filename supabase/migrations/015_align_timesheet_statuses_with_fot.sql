BEGIN;

-- Храним статусы FOT без объединения больничного, учебного отпуска и работы
-- на больничном с более общими локальными категориями.
ALTER TABLE tender_timesheet
  DROP CONSTRAINT IF EXISTS tender_timesheet_status_check;

ALTER TABLE tender_timesheet
  ALTER COLUMN status TYPE VARCHAR(32);

ALTER TABLE tender_timesheet
  ADD CONSTRAINT tender_timesheet_status_check
  CHECK (status IN (
    'work',
    'vacation',
    'sick',
    'dayoff',
    'remote',
    'unpaid',
    'absent',
    'educational_leave',
    'sick_worked'
  ));

-- После первой синхронизации расширенных статусов месячный итог учитывает
-- работу на больничном так же, как обычный рабочий день.
WITH totals AS (
  SELECT
    employee_id,
    EXTRACT(YEAR FROM work_date)::INTEGER AS year,
    EXTRACT(MONTH FROM work_date)::INTEGER AS month,
    COALESCE(SUM(hours_worked) FILTER (
      WHERE status IN ('work', 'remote', 'sick_worked')
    ), 0) AS total_hours
  FROM tender_timesheet
  GROUP BY employee_id, EXTRACT(YEAR FROM work_date), EXTRACT(MONTH FROM work_date)
)
UPDATE tender_timesheet_stats AS stats
SET
  total_hours = totals.total_hours,
  updated_at = NOW()
FROM totals
WHERE stats.employee_id = totals.employee_id
  AND stats.year = totals.year
  AND stats.month = totals.month;

COMMIT;
