-- Combined schema for Tender + SKUD modules
-- Run on a clean database to create all tables, indexes, functions, and grants

-- ============================================
-- 1. tender_employees (core entity)
-- ============================================
CREATE TABLE tender_employees (
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
  monthly_bonus DECIMAL(12,2) DEFAULT 0,
  country VARCHAR(100) DEFAULT 'Россия',
  snils VARCHAR(14),
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_employees_full_name ON tender_employees(full_name);
CREATE INDEX idx_employees_department ON tender_employees(department);
CREATE INDEX idx_employees_company ON tender_employees(company);
CREATE INDEX idx_employees_last_name ON tender_employees(last_name);
CREATE INDEX idx_employees_subdivision ON tender_employees(subdivision);

-- ============================================
-- 2. tender_salary_history
-- ============================================
CREATE TABLE tender_salary_history (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  salary DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_salary_history_employee ON tender_salary_history(employee_id);

-- ============================================
-- 3. tender_timesheet
-- ============================================
CREATE TABLE tender_timesheet (
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

-- ============================================
-- 4. tender_timesheet_stats
-- ============================================
CREATE TABLE tender_timesheet_stats (
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

-- ============================================
-- 5. tender_imports
-- ============================================
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

-- ============================================
-- 6. tender_position_history
-- ============================================
CREATE TABLE tender_position_history (
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

CREATE INDEX idx_position_history_employee ON tender_position_history(employee_id);
CREATE INDEX idx_position_history_date ON tender_position_history(effective_date);

-- ============================================
-- 7. tender_salary_calculations
-- ============================================
CREATE TABLE tender_salary_calculations (
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

CREATE INDEX idx_salary_calc_employee ON tender_salary_calculations(employee_id);
CREATE INDEX idx_salary_calc_period ON tender_salary_calculations(year, month);

-- ============================================
-- 8. tender_subdivisions
-- ============================================
CREATE TABLE tender_subdivisions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tender_subdivisions_name_normalized
  ON tender_subdivisions (LOWER(BTRIM(name)));

-- ============================================
-- 9. tender_employee_events
-- ============================================
CREATE TABLE tender_employee_events (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('archive', 'unarchive')),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tender_employee_events_employee ON tender_employee_events(employee_id);
CREATE INDEX idx_tender_employee_events_type ON tender_employee_events(event_type);
CREATE INDEX idx_tender_employee_events_date_desc ON tender_employee_events(event_date DESC, created_at DESC);

-- ============================================
-- 10. skud_events
-- ============================================
CREATE TABLE skud_events (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  event_datetime TIMESTAMP NOT NULL,
  event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('entry', 'exit')),
  physical_person VARCHAR(255),
  department VARCHAR(255),
  location VARCHAR(255),
  card_number VARCHAR(50),
  controller VARCHAR(100),
  door VARCHAR(100),
  manual_entry BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_skud_events_employee ON skud_events(employee_id);
CREATE INDEX idx_skud_events_date ON skud_events(event_date);
CREATE INDEX idx_skud_events_datetime ON skud_events(event_datetime);

-- ============================================
-- 11. skud_daily_summary
-- ============================================
CREATE TABLE skud_daily_summary (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  first_entry TIME,
  last_exit TIME,
  total_office_hours DECIMAL(4,2),
  entries_count INTEGER DEFAULT 0,
  exits_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'present',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

CREATE INDEX idx_skud_summary_employee ON skud_daily_summary(employee_id);
CREATE INDEX idx_skud_summary_date ON skud_daily_summary(work_date);

-- ============================================
-- RPC functions
-- ============================================
CREATE OR REPLACE FUNCTION archive_tender_employee(p_employee_id INT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  v_reason := BTRIM(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Причина архивации обязательна';
  END IF;

  UPDATE tender_employees
  SET is_archived = TRUE,
      archived_at = NOW()
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сотрудник % не найден', p_employee_id;
  END IF;

  INSERT INTO tender_employee_events (employee_id, event_type, event_date, note)
  VALUES (p_employee_id, 'archive', CURRENT_DATE, v_reason);
END;
$$;

CREATE OR REPLACE FUNCTION restore_tender_employee(p_employee_id INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tender_employees
  SET is_archived = FALSE,
      archived_at = NULL
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сотрудник % не найден', p_employee_id;
  END IF;

  INSERT INTO tender_employee_events (employee_id, event_type, event_date, note)
  VALUES (p_employee_id, 'unarchive', CURRENT_DATE, 'Возвращён из архива');
END;
$$;

-- ============================================
-- Grants
-- ============================================
GRANT ALL ON tender_employees TO anon, authenticated, service_role;
GRANT ALL ON tender_salary_history TO anon, authenticated, service_role;
GRANT ALL ON tender_timesheet TO anon, authenticated, service_role;
GRANT ALL ON tender_timesheet_stats TO anon, authenticated, service_role;
GRANT ALL ON tender_imports TO anon, authenticated, service_role;
GRANT ALL ON tender_position_history TO anon, authenticated, service_role;
GRANT ALL ON tender_salary_calculations TO anon, authenticated, service_role;
GRANT ALL ON tender_subdivisions TO anon, authenticated, service_role;
GRANT ALL ON tender_employee_events TO anon, authenticated, service_role;
GRANT ALL ON skud_events TO anon, authenticated, service_role;
GRANT ALL ON skud_daily_summary TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION archive_tender_employee(INT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION restore_tender_employee(INT) TO anon, authenticated, service_role;
