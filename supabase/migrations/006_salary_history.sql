CREATE TABLE IF NOT EXISTS tender_salary_history (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  salary DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_salary_history_employee ON tender_salary_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_date ON tender_salary_history(effective_date);
