BEGIN;

-- FOT отображает каждый день как Math.round(hours), поэтому храним ту же
-- целочисленную величину и не допускаем возврата дробных часов при новых записях.
ALTER TABLE tender_timesheet
  ALTER COLUMN hours_worked TYPE DECIMAL(4,0)
  USING CASE
    WHEN hours_worked IS NULL THEN NULL
    ELSE GREATEST(0, ROUND(hours_worked))
  END;

-- Месячный итог должен быть суммой уже округлённых дней, а не округлением
-- прежнего дробного итога.
WITH rounded_totals AS (
  SELECT
    employee_id,
    EXTRACT(YEAR FROM work_date)::INTEGER AS year,
    EXTRACT(MONTH FROM work_date)::INTEGER AS month,
    COALESCE(SUM(hours_worked) FILTER (WHERE status IN ('work', 'remote')), 0) AS total_hours
  FROM tender_timesheet
  GROUP BY employee_id, EXTRACT(YEAR FROM work_date), EXTRACT(MONTH FROM work_date)
)
UPDATE tender_timesheet_stats AS stats
SET
  total_hours = totals.total_hours,
  updated_at = NOW()
FROM rounded_totals AS totals
WHERE stats.employee_id = totals.employee_id
  AND stats.year = totals.year
  AND stats.month = totals.month;

ALTER TABLE tender_timesheet_stats
  ALTER COLUMN total_hours TYPE DECIMAL(6,0)
  USING GREATEST(0, ROUND(COALESCE(total_hours, 0)));

COMMIT;
