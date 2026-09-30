DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rent_records' AND column_name = 'rent_manual'
  ) THEN
    ALTER TABLE rent_records ADD COLUMN rent_manual boolean NOT NULL DEFAULT false;
    ALTER TABLE rent_records ADD COLUMN water_manual boolean NOT NULL DEFAULT false;
    ALTER TABLE rent_records ADD COLUMN electricity_manual boolean NOT NULL DEFAULT false;

    UPDATE rent_records SET
      rent_manual = COALESCE(rent_amount, 0) > 0,
      water_manual = COALESCE(water_amount, 0) > 0
        AND cold_water_tariff = 0 AND hot_water_tariff = 0 AND drainage_tariff = 0,
      electricity_manual = COALESCE(electricity_amount, 0) > 0;
  END IF;
END $$;

ALTER TABLE rent_records ADD COLUMN IF NOT EXISTS electricity_tariffs jsonb NOT NULL DEFAULT '{}'::jsonb;
