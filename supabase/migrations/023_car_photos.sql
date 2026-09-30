-- Фото машины для обложки страницы «Машина».
-- Supabase Storage на сервере не запущен, поэтому храним сжатый в браузере JPEG (data URL, ~150 КБ)
-- в отдельной таблице: список машин остаётся лёгким, фото грузится только для выбранной.

CREATE TABLE IF NOT EXISTS car_photos (
  car_id uuid PRIMARY KEY REFERENCES cars(id) ON DELETE CASCADE,
  image text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Доступ только к фото своих машин
ALTER TABLE car_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS car_photos_owner ON car_photos;
CREATE POLICY car_photos_owner ON car_photos
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM cars WHERE cars.id = car_photos.car_id AND cars.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM cars WHERE cars.id = car_photos.car_id AND cars.user_id = auth.uid()));

-- Права по умолчанию дают authenticated и TRUNCATE (обходит RLS) — оставляем только CRUD
REVOKE ALL ON car_photos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON car_photos TO authenticated;
GRANT ALL ON car_photos TO service_role;
