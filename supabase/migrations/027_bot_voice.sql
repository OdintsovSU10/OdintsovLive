ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS elevenlabs_api_key text;

DROP FUNCTION IF EXISTS set_bot_settings(text, text, text, text);

CREATE OR REPLACE FUNCTION set_bot_settings(
  p_telegram_bot_token text DEFAULT NULL,
  p_telegram_owner_id text DEFAULT NULL,
  p_openrouter_api_key text DEFAULT NULL,
  p_openrouter_model text DEFAULT NULL,
  p_elevenlabs_api_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE bot_settings SET
    telegram_bot_token = coalesce(nullif(trim(p_telegram_bot_token), ''), telegram_bot_token),
    openrouter_api_key = coalesce(nullif(trim(p_openrouter_api_key), ''), openrouter_api_key),
    elevenlabs_api_key = coalesce(nullif(trim(p_elevenlabs_api_key), ''), elevenlabs_api_key),
    telegram_owner_id = CASE WHEN p_telegram_owner_id IS NULL THEN telegram_owner_id ELSE nullif(trim(p_telegram_owner_id), '') END,
    openrouter_model = CASE WHEN p_openrouter_model IS NULL THEN openrouter_model ELSE nullif(trim(p_openrouter_model), '') END,
    owner_user_id = auth.uid(),
    last_error = NULL,
    updated_at = now()
  WHERE id = 1;

  RETURN get_bot_settings();
END;
$$;

REVOKE ALL ON FUNCTION set_bot_settings(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_bot_settings(text, text, text, text, text) TO authenticated;

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
    'has_elevenlabs_key', coalesce(s.elevenlabs_api_key, '') <> '',
    'elevenlabs_key_hint', CASE WHEN coalesce(s.elevenlabs_api_key, '') <> '' THEN right(s.elevenlabs_api_key, 4) END,
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
