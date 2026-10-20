-- Сроки страховок для напоминаний бота
ALTER TABLE cars ADD COLUMN IF NOT EXISTS osago_until date;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS kasko_until date;

-- Разовые уведомления бота (80% лимита, дайджест недели, ТО): ключ — что и за какой период, чтобы после перезапуска не слать повторно
CREATE TABLE IF NOT EXISTS bot_notifications_sent (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE bot_notifications_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bot_notifications_sent FROM anon, authenticated;
GRANT ALL ON bot_notifications_sent TO service_role;
