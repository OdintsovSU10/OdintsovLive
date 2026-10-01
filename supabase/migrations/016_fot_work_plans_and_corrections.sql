BEGIN;

ALTER TABLE tender_timesheet
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS correction_author TEXT,
  ADD COLUMN IF NOT EXISTS correction_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correction_approval_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS correction_source_type VARCHAR(64);

CREATE TABLE IF NOT EXISTS tender_work_plans (
  id BIGSERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  schedule_id VARCHAR(64) NOT NULL,
  schedule_name TEXT,
  schedule_type VARCHAR(32) NOT NULL,
  schedule_source VARCHAR(32) NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT FALSE,
  planned_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  full_day_threshold_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  work_start TIME,
  work_end TIME,
  lunch_minutes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_tender_work_plans_employee_date
  ON tender_work_plans(employee_id, work_date);

GRANT ALL ON tender_work_plans TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE tender_work_plans_id_seq TO anon, authenticated, service_role;

COMMIT;
