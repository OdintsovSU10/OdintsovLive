-- Ensure CASCADE delete for tender_salary_history
ALTER TABLE IF EXISTS tender_salary_history
DROP CONSTRAINT IF EXISTS tender_salary_history_employee_id_fkey;

ALTER TABLE IF EXISTS tender_salary_history
ADD CONSTRAINT tender_salary_history_employee_id_fkey
FOREIGN KEY (employee_id) REFERENCES tender_employees(id) ON DELETE CASCADE;
