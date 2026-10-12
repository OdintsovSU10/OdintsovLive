-- Счётчики пробега по агрегатам машины (форсунки, масло CVT и т.п.) и признак «замена» в записи ТО.
-- car_maintenance.resets — чьи счётчики сбрасывает запись: 'engine_oil' (масло двигателя) и/или id агрегата.
-- Пустой список — покупка или работа без замены, счётчики не меняются.

SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS car_service_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id uuid NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  name text NOT NULL,
  replaced_mileage int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS car_service_units_car_id_idx ON car_service_units (car_id);

-- Доступ только к агрегатам своих машин
ALTER TABLE car_service_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS car_service_units_owner ON car_service_units;
CREATE POLICY car_service_units_owner ON car_service_units
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM cars WHERE cars.id = car_service_units.car_id AND cars.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM cars WHERE cars.id = car_service_units.car_id AND cars.user_id = auth.uid()));

-- Права по умолчанию дают authenticated и TRUNCATE (обходит RLS) — оставляем только CRUD
REVOKE ALL ON car_service_units FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON car_service_units TO authenticated;
GRANT ALL ON car_service_units TO service_role;

-- Колонка и разметка старых записей — один раз: повторный прогон не вернёт снятые вручную отметки.
-- Раньше замену масла угадывали по тексту работ («ТО», «масл…»); оба регистра перечислены явно,
-- чтобы результат не зависел от локали базы. Записи со словом «покупка» заменой не считаем.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'car_maintenance' AND column_name = 'resets'
  ) THEN
    ALTER TABLE car_maintenance ADD COLUMN resets text[] NOT NULL DEFAULT '{}';
    UPDATE car_maintenance
    SET resets = ARRAY['engine_oil']
    WHERE type ~ '(^|[^а-яёА-ЯЁ])[тТ][оО]([^а-яёА-ЯЁ]|$)|[мМ][аА][сС][лЛ]'
      AND type !~ '[пП][оО][кК][уУ][пП][кК]';
  END IF;
END;
$$;

-- Rollback:
-- ALTER TABLE car_maintenance DROP COLUMN resets;
-- DROP TABLE car_service_units;
