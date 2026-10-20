-- Настройки напоминаний бота (счётчики, дела, прочие проверки). Пустой объект = значения по умолчанию;
-- бот сливает их с дефолтами и проверяет сам (ops/telegram-bot/reminderSettings.mjs).
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS reminder_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION get_reminder_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT reminder_settings INTO result FROM bot_settings WHERE id = 1;

  RETURN coalesce(result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION set_reminder_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'reminder settings must be a json object' USING ERRCODE = '22023';
  END IF;

  UPDATE bot_settings SET
    reminder_settings = p_settings,
    updated_at = now()
  WHERE id = 1;

  RETURN get_reminder_settings();
END;
$$;

REVOKE ALL ON FUNCTION get_reminder_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_reminder_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_reminder_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION set_reminder_settings(jsonb) TO authenticated;
