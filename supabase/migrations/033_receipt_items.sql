-- Позиции чека: бот разбирает фото чека построчно и привязывает строки к трате
CREATE TABLE IF NOT EXISTS expense_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES expense_transactions(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  name text NOT NULL,
  quantity numeric(12,3),
  price numeric(12,2),
  amount numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_receipt_items_transaction_idx ON expense_receipt_items (transaction_id);

ALTER TABLE expense_receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_receipt_items_owner ON expense_receipt_items;
CREATE POLICY expense_receipt_items_owner ON expense_receipt_items
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON expense_receipt_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_receipt_items TO authenticated;
GRANT ALL ON expense_receipt_items TO service_role;
