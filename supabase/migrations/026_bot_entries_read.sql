-- Лента «Последние записи» на главной: пользователь читает только свои записи бота.
-- Бот пишет через service_role — RLS его не касается.

ALTER TABLE telegram_bot_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_bot_entries_owner_read ON telegram_bot_entries;
CREATE POLICY telegram_bot_entries_owner_read ON telegram_bot_entries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON telegram_bot_entries TO authenticated;
