-- Расширение таблицы tender_employees
ALTER TABLE tender_employees
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS department VARCHAR(255),
ADD COLUMN IF NOT EXISTS subdivision VARCHAR(255),
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Россия',
ADD COLUMN IF NOT EXISTS snils VARCHAR(14),
ADD COLUMN IF NOT EXISTS company VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_employees_department ON tender_employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_company ON tender_employees(company);
CREATE INDEX IF NOT EXISTS idx_employees_subdivision ON tender_employees(subdivision);

-- История должностей
CREATE TABLE IF NOT EXISTS tender_position_history (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  position VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  subdivision VARCHAR(255),
  effective_date DATE NOT NULL,
  end_date DATE,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_position_history_employee ON tender_position_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_position_history_date ON tender_position_history(effective_date);

-- Расчёты ЗП по месяцам
CREATE TABLE IF NOT EXISTS tender_salary_calculations (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  base_salary DECIMAL(12,2) NOT NULL,
  work_days_norm INTEGER NOT NULL,
  work_days_actual INTEGER NOT NULL DEFAULT 0,
  work_hours_actual DECIMAL(6,2) DEFAULT 0,
  remote_days INTEGER DEFAULT 0,
  vacation_days INTEGER DEFAULT 0,
  dayoff_days INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  calculated_salary DECIMAL(12,2) NOT NULL,
  bonus DECIMAL(12,2) DEFAULT 0,
  deductions DECIMAL(12,2) DEFAULT 0,
  final_salary DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_salary_calc_employee ON tender_salary_calculations(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_calc_period ON tender_salary_calculations(year, month);

-- Журнал импортов
CREATE TABLE IF NOT EXISTS tender_imports (
  id SERIAL PRIMARY KEY,
  import_type VARCHAR(50) NOT NULL CHECK (import_type IN ('employees', 'timesheet')),
  file_name VARCHAR(255),
  year INTEGER,
  month INTEGER,
  records_total INTEGER DEFAULT 0,
  records_success INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  errors JSONB,
  imported_at TIMESTAMP DEFAULT NOW()
);
