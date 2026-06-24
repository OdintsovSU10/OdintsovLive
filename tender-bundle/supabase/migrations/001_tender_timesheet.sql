CREATE TABLE IF NOT EXISTS tender_timesheet (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('work', 'vacation', 'dayoff', 'remote', 'unpaid', 'absent')),
  hours_worked DECIMAL(4,2),
  is_correction BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

CREATE INDEX idx_timesheet_employee ON tender_timesheet(employee_id);
CREATE INDEX idx_timesheet_date ON tender_timesheet(work_date);
