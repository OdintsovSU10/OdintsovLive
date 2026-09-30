ALTER TABLE telegram_bot_entries ADD COLUMN IF NOT EXISTS message_ids bigint[] NOT NULL DEFAULT '{}';
