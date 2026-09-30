-- Кадр обложки: точка фокуса (доли 0–1 по ширине и высоте фото) и масштаб.
-- Фокус остаётся в кадре при любом соотношении сторон — одинаково на телефоне и компьютере.

ALTER TABLE car_photos ADD COLUMN IF NOT EXISTS focus_x real NOT NULL DEFAULT 0.5;
ALTER TABLE car_photos ADD COLUMN IF NOT EXISTS focus_y real NOT NULL DEFAULT 0.7;
ALTER TABLE car_photos ADD COLUMN IF NOT EXISTS zoom real NOT NULL DEFAULT 1;

ALTER TABLE car_photos DROP CONSTRAINT IF EXISTS car_photos_frame_check;
ALTER TABLE car_photos ADD CONSTRAINT car_photos_frame_check
  CHECK (focus_x BETWEEN 0 AND 1 AND focus_y BETWEEN 0 AND 1 AND zoom BETWEEN 1 AND 4);
