-- Data restored with explicit IDs can leave SERIAL sequences behind the rows.
-- Never move a sequence backwards: deleted rows may already have consumed IDs.

SELECT setval(
  'public.calendar_days_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.calendar_days), 1),
    (SELECT last_value FROM public.calendar_days_id_seq)
  ),
  TRUE
);

-- Restore the ownership link that is missing in the production database.
ALTER SEQUENCE public.calendar_days_id_seq OWNED BY public.calendar_days.id;

SELECT setval(
  'public.tender_employee_events_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_employee_events), 1),
    (SELECT last_value FROM public.tender_employee_events_id_seq)
  ),
  TRUE
);

SELECT setval(
  'public.tender_employees_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_employees), 1),
    (SELECT last_value FROM public.tender_employees_id_seq)
  ),
  TRUE
);

SELECT setval(
  'public.tender_imports_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_imports), 1),
    (SELECT last_value FROM public.tender_imports_id_seq)
  ),
  TRUE
);

SELECT setval(
  'public.tender_salary_history_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_salary_history), 1),
    (SELECT last_value FROM public.tender_salary_history_id_seq)
  ),
  TRUE
);

SELECT setval(
  'public.tender_subdivisions_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_subdivisions), 1),
    (SELECT last_value FROM public.tender_subdivisions_id_seq)
  ),
  TRUE
);

SELECT setval(
  'public.tender_timesheet_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_timesheet), 1),
    (SELECT last_value FROM public.tender_timesheet_id_seq)
  ),
  TRUE
);

SELECT setval(
  'public.tender_timesheet_stats_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM public.tender_timesheet_stats), 1),
    (SELECT last_value FROM public.tender_timesheet_stats_id_seq)
  ),
  TRUE
);
