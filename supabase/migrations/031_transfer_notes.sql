-- Бот спрашивает «за что» по исходящим переводам людям: когда спросил и id вопроса (для ответа reply)
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS note_asked_at timestamptz;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS note_prompt_message_id bigint;
