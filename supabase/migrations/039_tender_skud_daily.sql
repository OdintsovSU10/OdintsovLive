-- Дневная статистика СКУД по сотрудникам (перерывы, время вне офиса).
-- Заполняется серверным синком scripts/sync-fot-timesheet.mjs с флагом --skud.
CREATE TABLE IF NOT EXISTS public.tender_skud_daily (
  employee_id integer NOT NULL REFERENCES public.tender_employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  events_count integer NOT NULL,
  exits_count integer NOT NULL,
  outside_minutes integer NOT NULL,
  presence_minutes integer NOT NULL,
  first_entry time,
  last_exit time,
  has_open_pair boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_tender_skud_daily_work_date
  ON public.tender_skud_daily (work_date);

GRANT SELECT ON public.tender_skud_daily TO authenticated;
GRANT ALL ON public.tender_skud_daily TO service_role;

COMMENT ON TABLE public.tender_skud_daily IS 'Дневная статистика СКУД по сотрудникам (из событий FOT); дни без событий не хранятся';
COMMENT ON COLUMN public.tender_skud_daily.events_count IS 'Число событий СКУД за день (все, включая непарные)';
COMMENT ON COLUMN public.tender_skud_daily.exits_count IS 'Число перерывов: выход, после которого в тот же день был вход';
COMMENT ON COLUMN public.tender_skud_daily.outside_minutes IS 'Сумма длительностей перерывов (время вне офиса), минуты';
COMMENT ON COLUMN public.tender_skud_daily.presence_minutes IS 'Сумма пар вход → выход, минуты';
COMMENT ON COLUMN public.tender_skud_daily.first_entry IS 'Время первого входа за день';
COMMENT ON COLUMN public.tender_skud_daily.last_exit IS 'Время последнего выхода за день';
COMMENT ON COLUMN public.tender_skud_daily.has_open_pair IS 'Есть вход без выхода (незакрытая пара)';
COMMENT ON COLUMN public.tender_skud_daily.updated_at IS 'Когда строка пересчитана синком';
