CREATE TABLE IF NOT EXISTS expense_merchant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_key text NOT NULL,
  display_name text,
  category_id uuid REFERENCES expense_user_categories(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'llm' CHECK (source IN ('llm', 'user')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT expense_merchant_rules_user_key_key UNIQUE (user_id, merchant_key)
);

REVOKE ALL ON expense_merchant_rules FROM anon;
GRANT ALL ON expense_merchant_rules TO authenticated, service_role;
