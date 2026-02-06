-- SKUD events table (raw data from imports)
CREATE TABLE IF NOT EXISTS skud_events (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  event_datetime TIMESTAMP NOT NULL,
  event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('entry', 'exit')),
  physical_person VARCHAR(255),
  department VARCHAR(255),
  location VARCHAR(255),
  card_number VARCHAR(50),
  controller VARCHAR(100),
  door VARCHAR(100),
  manual_entry BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_skud_events_employee ON skud_events(employee_id);
CREATE INDEX idx_skud_events_date ON skud_events(event_date);
CREATE INDEX idx_skud_events_datetime ON skud_events(event_datetime);

-- SKUD daily summary table (processed data, similar to tender_timesheet)
CREATE TABLE IF NOT EXISTS skud_daily_summary (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES tender_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  first_entry TIME,
  last_exit TIME,
  total_office_hours DECIMAL(4,2),
  entries_count INTEGER DEFAULT 0,
  exits_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'present',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

CREATE INDEX idx_skud_summary_employee ON skud_daily_summary(employee_id);
CREATE INDEX idx_skud_summary_date ON skud_daily_summary(work_date);
