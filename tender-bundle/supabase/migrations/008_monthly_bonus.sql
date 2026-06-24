ALTER TABLE tender_employees
ADD COLUMN IF NOT EXISTS monthly_bonus DECIMAL(12,2) DEFAULT 0;

COMMENT ON COLUMN tender_employees.monthly_bonus IS 'Ежемесячный бонус сотрудника';
