SELECT setval(
  pg_get_serial_sequence('tender_imports', 'id'),
  COALESCE((SELECT MAX(id) FROM tender_imports), 1),
  TRUE
);
