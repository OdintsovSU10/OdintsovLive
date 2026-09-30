ALTER TABLE rent_records ADD COLUMN IF NOT EXISTS cold_water_tariff numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE rent_records ADD COLUMN IF NOT EXISTS hot_water_tariff numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE rent_records ADD COLUMN IF NOT EXISTS drainage_tariff numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS meter_ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  image_base64 text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  result jsonb,
  error text,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meter_ocr_jobs_status_created_idx
  ON meter_ocr_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS meter_ocr_jobs_user_period_idx
  ON meter_ocr_jobs(user_id, year, month, created_at);

GRANT ALL ON meter_ocr_jobs TO anon, authenticated, service_role;
