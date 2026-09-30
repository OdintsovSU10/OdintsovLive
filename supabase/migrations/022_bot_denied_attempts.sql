ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS denied_count integer NOT NULL DEFAULT 0;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS last_denied_at timestamptz;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS last_denied_user text;

CREATE OR REPLACE FUNCTION note_bot_denied(p_user text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE bot_settings SET
    denied_count = denied_count + 1,
    last_denied_at = now(),
    last_denied_user = left(p_user, 100)
  WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION note_bot_denied(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION note_bot_denied(text) TO service_role;

CREATE OR REPLACE FUNCTION get_bot_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s bot_settings;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM bot_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'has_telegram_token', coalesce(s.telegram_bot_token, '') <> '',
    'telegram_token_hint', CASE WHEN coalesce(s.telegram_bot_token, '') <> '' THEN split_part(s.telegram_bot_token, ':', 1) END,
    'has_openrouter_key', coalesce(s.openrouter_api_key, '') <> '',
    'openrouter_key_hint', CASE WHEN coalesce(s.openrouter_api_key, '') <> '' THEN right(s.openrouter_api_key, 4) END,
    'telegram_owner_id', s.telegram_owner_id,
    'openrouter_model', s.openrouter_model,
    'bot_username', s.bot_username,
    'last_seen_at', s.last_seen_at,
    'last_error', s.last_error,
    'denied_count', s.denied_count,
    'last_denied_at', s.last_denied_at,
    'last_denied_user', s.last_denied_user,
    'updated_at', s.updated_at
  );
END;
$$;
