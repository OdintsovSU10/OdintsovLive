ALTER TABLE expense_transactions
  ADD COLUMN IF NOT EXISTS include_in_analytics boolean NOT NULL DEFAULT true;
