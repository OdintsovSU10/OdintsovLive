CREATE TABLE cars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  manufacture_month int,
  manufacture_year int NOT NULL,
  purchase_date date NOT NULL,
  purchase_mileage int DEFAULT 0,
  current_mileage int DEFAULT 0,
  purchase_price numeric(12,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX cars_user_id_idx ON cars(user_id);

CREATE TABLE car_maintenance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id uuid REFERENCES cars(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  mileage int,
  type text NOT NULL,
  description text,
  cost numeric(10,2),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX car_maintenance_car_id_idx ON car_maintenance(car_id);

CREATE TABLE car_fuel (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id uuid REFERENCES cars(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  mileage int,
  liters numeric(6,2),
  price_per_liter numeric(6,2),
  total_cost numeric(10,2),
  fuel_type text DEFAULT 'АИ-95',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX car_fuel_car_id_idx ON car_fuel(car_id);

CREATE TABLE car_expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id uuid REFERENCES cars(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  category text NOT NULL,
  description text,
  cost numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX car_expenses_car_id_idx ON car_expenses(car_id);

CREATE TABLE car_calendar_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id uuid REFERENCES cars(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  event_type text NOT NULL,
  reference_id uuid,
  title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX car_calendar_events_car_id_idx ON car_calendar_events(car_id);
CREATE INDEX car_calendar_events_date_idx ON car_calendar_events(date);
