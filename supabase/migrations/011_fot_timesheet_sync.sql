ALTER TABLE tender_employees
ADD COLUMN IF NOT EXISTS fot_employee_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS sigur_employee_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS tab_number VARCHAR(64),
ADD COLUMN IF NOT EXISTS excluded_from_timesheet BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_employees_fot_employee_id
  ON tender_employees (fot_employee_id)
  WHERE fot_employee_id IS NOT NULL AND BTRIM(fot_employee_id) <> '';

CREATE INDEX IF NOT EXISTS idx_tender_employees_sigur_employee_id
  ON tender_employees (sigur_employee_id)
  WHERE sigur_employee_id IS NOT NULL AND BTRIM(sigur_employee_id) <> '';

CREATE INDEX IF NOT EXISTS idx_tender_employees_tab_number
  ON tender_employees (tab_number)
  WHERE tab_number IS NOT NULL AND BTRIM(tab_number) <> '';

ALTER TABLE tender_imports
DROP CONSTRAINT IF EXISTS tender_imports_import_type_check;

ALTER TABLE tender_imports
ADD CONSTRAINT tender_imports_import_type_check
CHECK (import_type IN ('employees', 'timesheet', 'fot_timesheet_sync'));
