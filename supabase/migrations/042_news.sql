-- Новости из публичных Telegram-каналов: каналы, посты с оценкой важности от нейронки, настройки владельца.
-- Сбор и оценку делает бот (ops/telegram-bot/news.mjs, service_role), портал читает и правит каналы/настройки.

CREATE TABLE IF NOT EXISTS news_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  title text,
  enabled boolean NOT NULL DEFAULT true,
  last_post_id bigint,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, username)
);

CREATE TABLE IF NOT EXISTS news_posts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES news_channels(id) ON DELETE CASCADE,
  post_id bigint NOT NULL,
  url text NOT NULL,
  published_at timestamptz NOT NULL,
  body text NOT NULL,
  importance smallint CHECK (importance BETWEEN 0 AND 100),
  band text CHECK (band IN ('critical', 'important', 'normal', 'noise')),
  category text,
  summary text,
  reason text,
  llm_state text NOT NULL DEFAULT 'pending' CHECK (llm_state IN ('pending', 'done', 'failed', 'skipped')),
  llm_attempts smallint NOT NULL DEFAULT 0,
  prompt_version smallint,
  model text,
  pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  fts tsvector GENERATED ALWAYS AS (to_tsvector('russian', coalesce(summary, '') || ' ' || body)) STORED,
  UNIQUE (channel_id, post_id)
);

CREATE INDEX IF NOT EXISTS news_posts_user_published_idx ON news_posts (user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS news_posts_pending_idx ON news_posts (published_at DESC) WHERE llm_state = 'pending';
CREATE INDEX IF NOT EXISTS news_posts_fts_idx ON news_posts USING GIN (fts);

CREATE TABLE IF NOT EXISTS news_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  interests text NOT NULL DEFAULT '',
  digest_time time NOT NULL DEFAULT '09:00',
  push_threshold smallint NOT NULL DEFAULT 80 CHECK (push_threshold BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE news_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS news_channels_owner ON news_channels;
CREATE POLICY news_channels_owner ON news_channels
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS news_posts_owner ON news_posts;
CREATE POLICY news_posts_owner ON news_posts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE news_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS news_settings_owner ON news_settings;
CREATE POLICY news_settings_owner ON news_settings
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON news_channels, news_posts, news_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON news_channels, news_posts, news_settings TO authenticated;
GRANT ALL ON news_channels, news_posts, news_settings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE news_posts_id_seq TO authenticated, service_role;
