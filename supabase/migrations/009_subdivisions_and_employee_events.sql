CREATE TABLE IF NOT EXISTS tender_subdivisions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_subdivisions_name_normalized
  ON tender_subdivisions (LOWER(BTRIM(name)));

INSERT INTO tender_subdivisions (name)
SELECT DISTINCT BTRIM(subdivision)
FROM tender_employees
WHERE subdivision IS NOT NULL
  AND BTRIM(subdivision) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM tender_subdivisions ts
    WHERE LOWER(BTRIM(ts.name)) = LOWER(BTRIM(tender_employees.subdivision))
  );

CREATE TABLE IF NOT EXISTS tender_employee_events (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('archive', 'unarchive')),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_employee_events_employee
  ON tender_employee_events(employee_id);

CREATE INDEX IF NOT EXISTS idx_tender_employee_events_type
  ON tender_employee_events(event_type);

CREATE INDEX IF NOT EXISTS idx_tender_employee_events_date_desc
  ON tender_employee_events(event_date DESC, created_at DESC);

CREATE OR REPLACE FUNCTION archive_tender_employee(p_employee_id INT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  v_reason := BTRIM(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Причина архивации обязательна';
  END IF;

  UPDATE tender_employees
  SET is_archived = TRUE,
      archived_at = NOW()
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сотрудник % не найден', p_employee_id;
  END IF;

  INSERT INTO tender_employee_events (employee_id, event_type, event_date, note)
  VALUES (p_employee_id, 'archive', CURRENT_DATE, v_reason);
END;
$$;

CREATE OR REPLACE FUNCTION restore_tender_employee(p_employee_id INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tender_employees
  SET is_archived = FALSE,
      archived_at = NULL
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сотрудник % не найден', p_employee_id;
  END IF;

  INSERT INTO tender_employee_events (employee_id, event_type, event_date, note)
  VALUES (p_employee_id, 'unarchive', CURRENT_DATE, 'Возвращён из архива');
END;
$$;

GRANT ALL ON tender_subdivisions TO anon, authenticated, service_role;
GRANT ALL ON tender_employee_events TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE tender_subdivisions_id_seq TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE tender_employee_events_id_seq TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION archive_tender_employee(INT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION restore_tender_employee(INT) TO anon, authenticated, service_role;
