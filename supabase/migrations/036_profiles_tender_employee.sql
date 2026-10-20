ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tender_employee_id integer
  REFERENCES public.tender_employees(id) ON DELETE SET NULL;
