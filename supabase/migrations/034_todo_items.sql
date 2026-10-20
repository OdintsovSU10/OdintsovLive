-- Раздел «Дела»: задачи с необязательным сроком, добавляются на сайте и голосом через бота
CREATE TABLE IF NOT EXISTS todo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  due_date date,
  done_at timestamptz,
  source text NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'telegram')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todo_items_user_open_idx ON todo_items (user_id, done_at, due_date);

ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS todo_items_owner ON todo_items;
CREATE POLICY todo_items_owner ON todo_items
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON todo_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON todo_items TO authenticated;
GRANT ALL ON todo_items TO service_role;
