-- Срок дела со временем: remind_at — момент срока (например 14:00), бот напоминает за 2 ч, за 1 ч и в срок.
-- remind_sent — сколько этапов уже отправлено (0..3); при смене remind_at счётчик сбрасывается.
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS remind_at timestamptz;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS remind_sent smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION todo_items_reset_remind_sent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.remind_at IS DISTINCT FROM OLD.remind_at THEN
    NEW.remind_sent := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todo_items_reset_remind_sent ON todo_items;
CREATE TRIGGER todo_items_reset_remind_sent
  BEFORE UPDATE ON todo_items
  FOR EACH ROW EXECUTE FUNCTION todo_items_reset_remind_sent();

CREATE INDEX IF NOT EXISTS todo_items_remind_idx ON todo_items (remind_at)
  WHERE remind_at IS NOT NULL AND done_at IS NULL AND remind_sent < 3;
