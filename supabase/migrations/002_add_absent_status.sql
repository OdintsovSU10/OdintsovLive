-- Add 'absent' status to timesheet check constraint
ALTER TABLE tender_timesheet
DROP CONSTRAINT IF EXISTS tender_timesheet_status_check;

ALTER TABLE tender_timesheet
ADD CONSTRAINT tender_timesheet_status_check
CHECK (status IN ('work', 'vacation', 'dayoff', 'remote', 'unpaid', 'absent'));
