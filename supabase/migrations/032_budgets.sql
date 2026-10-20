-- Бюджеты: месячный лимит на категорию пользователя и день зарплаты (период бюджета — от зарплаты до зарплаты)
CREATE TABLE IF NOT EXISTS expense_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES expense_user_categories(id) ON DELETE CASCADE,
  monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT expense_budgets_user_category_key UNIQUE (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS expense_budget_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payday smallint NOT NULL DEFAULT 1 CHECK (payday BETWEEN 1 AND 31),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE expense_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_budgets_owner ON expense_budgets;
CREATE POLICY expense_budgets_owner ON expense_budgets
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON expense_budgets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_budgets TO authenticated;
GRANT ALL ON expense_budgets TO service_role;

ALTER TABLE expense_budget_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_budget_settings_owner ON expense_budget_settings;
CREATE POLICY expense_budget_settings_owner ON expense_budget_settings
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON expense_budget_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_budget_settings TO authenticated;
GRANT ALL ON expense_budget_settings TO service_role;
