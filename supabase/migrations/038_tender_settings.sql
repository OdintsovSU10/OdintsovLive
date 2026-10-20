CREATE TABLE IF NOT EXISTS public.tender_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tender_settings TO authenticated;
GRANT ALL ON public.tender_settings TO service_role;
