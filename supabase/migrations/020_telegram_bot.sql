ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bank'
  CHECK (source IN ('bank', 'telegram'));
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS expense_transactions_user_source_idx
  ON expense_transactions(user_id, source)
  WHERE source = 'telegram';

CREATE TABLE IF NOT EXISTS telegram_bot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  message_id bigint NOT NULL,
  input_text text,
  created_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  undone boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_bot_entries_user_created_idx
  ON telegram_bot_entries(user_id, created_at);

REVOKE ALL ON telegram_bot_entries FROM anon, authenticated;
GRANT ALL ON telegram_bot_entries TO service_role;
