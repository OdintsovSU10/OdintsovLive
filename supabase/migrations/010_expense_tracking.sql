CREATE TABLE IF NOT EXISTS expense_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_file_name text NOT NULL,
  source_file_hash text NOT NULL,
  rows_total integer NOT NULL DEFAULT 0,
  rows_parsed integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  errors jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_import_batches_user_created_idx
  ON expense_import_batches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS expense_user_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748B',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT expense_user_categories_user_name_key UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS expense_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_category text NOT NULL,
  target_category_id uuid NOT NULL REFERENCES expense_user_categories(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT expense_category_mappings_user_bank_category_key UNIQUE(user_id, bank_category)
);

CREATE TABLE IF NOT EXISTS expense_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_batch_id uuid REFERENCES expense_import_batches(id) ON DELETE SET NULL,
  source_row_number integer NOT NULL,
  dedupe_key text NOT NULL,
  row_hash text NOT NULL,
  operation_at timestamp NOT NULL,
  operation_date date NOT NULL,
  payment_date date,
  card_mask text,
  status text,
  operation_amount numeric(14,2),
  operation_currency text,
  payment_amount numeric(14,2) NOT NULL,
  payment_currency text,
  cashback_amount numeric(14,2) NOT NULL DEFAULT 0,
  bank_category text,
  mcc text,
  description text,
  bonuses_amount numeric(14,2) NOT NULL DEFAULT 0,
  round_up_amount numeric(14,2) NOT NULL DEFAULT 0,
  operation_with_rounding_amount numeric(14,2),
  flow_direction text NOT NULL CHECK (flow_direction IN ('in', 'out', 'zero')),
  mapped_category_id uuid REFERENCES expense_user_categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT expense_transactions_user_dedupe_key UNIQUE(user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS expense_transactions_user_operation_at_idx
  ON expense_transactions(user_id, operation_at DESC);

CREATE INDEX IF NOT EXISTS expense_transactions_user_flow_operation_at_idx
  ON expense_transactions(user_id, flow_direction, operation_at DESC);

CREATE INDEX IF NOT EXISTS expense_transactions_user_bank_category_idx
  ON expense_transactions(user_id, bank_category);

CREATE INDEX IF NOT EXISTS expense_transactions_user_mapped_category_idx
  ON expense_transactions(user_id, mapped_category_id);

CREATE INDEX IF NOT EXISTS expense_transactions_user_mcc_idx
  ON expense_transactions(user_id, mcc);

GRANT ALL ON expense_import_batches TO anon, authenticated, service_role;
GRANT ALL ON expense_user_categories TO anon, authenticated, service_role;
GRANT ALL ON expense_category_mappings TO anon, authenticated, service_role;
GRANT ALL ON expense_transactions TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
