CREATE TABLE IF NOT EXISTS tender_timesheet_stats (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  work_days_actual INTEGER NOT NULL DEFAULT 0,
  work_days_norm INTEGER NOT NULL DEFAULT 22,
  weekend_work_days INTEGER NOT NULL DEFAULT 0,
  total_hours DECIMAL(6,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, year, month)
);

CREATE INDEX idx_timesheet_stats_employee ON tender_timesheet_stats(employee_id);
CREATE INDEX idx_timesheet_stats_period ON tender_timesheet_stats(year, month);
