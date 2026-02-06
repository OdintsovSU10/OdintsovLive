-- Миграция: полная структура tender_employees
-- Если таблица не существует - создаём полностью
CREATE TABLE IF NOT EXISTS tender_employees (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(100),
  first_name VARCHAR(100),
  middle_name VARCHAR(100),
  position VARCHAR(255) NOT NULL DEFAULT '',
  department VARCHAR(255),
  subdivision VARCHAR(255),
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  birth_date DATE,
  group_name VARCHAR(100),
  current_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  country VARCHAR(100) DEFAULT 'Россия',
  snils VARCHAR(14),
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Добавляем колонки если они отсутствуют
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS subdivision VARCHAR(255);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Россия';
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS snils VARCHAR(14);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS company VARCHAR(255);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE tender_employees ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_employees_full_name ON tender_employees(full_name);
CREATE INDEX IF NOT EXISTS idx_employees_department ON tender_employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_company ON tender_employees(company);
CREATE INDEX IF NOT EXISTS idx_employees_last_name ON tender_employees(last_name);

-- История зарплат
CREATE TABLE IF NOT EXISTS tender_salary_history (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  salary DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_history_employee ON tender_salary_history(employee_id);

-- Табель
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

CREATE INDEX IF NOT EXISTS idx_timesheet_employee ON tender_timesheet(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_date ON tender_timesheet(work_date);

-- Журнал импортов (без CHECK constraint для совместимости)
DROP TABLE IF EXISTS tender_imports;
CREATE TABLE tender_imports (
  id SERIAL PRIMARY KEY,
  import_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(255),
  year INTEGER,
  month INTEGER,
  records_total INTEGER DEFAULT 0,
  records_success INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  errors JSONB,
  imported_at TIMESTAMP DEFAULT NOW()
);

-- Права доступа
GRANT ALL ON tender_employees TO anon, authenticated, service_role;
GRANT ALL ON tender_salary_history TO anon, authenticated, service_role;
GRANT ALL ON tender_timesheet TO anon, authenticated, service_role;
GRANT ALL ON tender_imports TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
