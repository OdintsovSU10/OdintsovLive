-- Sequence for calendar_days
CREATE SEQUENCE IF NOT EXISTS calendar_days_id_seq;

-- profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL PRIMARY KEY,
    email text,
    approved boolean DEFAULT false,
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE,
    font_headline varchar(100) DEFAULT 'Cormorant Garamond',
    font_body varchar(100) DEFAULT 'DM Sans',
    font_mono varchar(100) DEFAULT 'DM Mono',
    font_size_base integer DEFAULT 16,
    custom_fonts jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- calendar_days table
CREATE TABLE IF NOT EXISTS public.calendar_days (
    id integer NOT NULL DEFAULT nextval('calendar_days_id_seq') PRIMARY KEY,
    date date NOT NULL,
    status text NOT NULL,
    user_id uuid NOT NULL,
    CONSTRAINT calendar_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_days_user_date_key ON public.calendar_days (user_id, date);

-- salary_settings table
CREATE TABLE IF NOT EXISTS public.salary_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    base_salary numeric(12,2) NOT NULL DEFAULT 100000,
    bonus numeric(12,2) DEFAULT 0,
    transport_base_cost numeric(12,2) DEFAULT 0,
    work_days_norm integer DEFAULT 22,
    manual_vacation_rate numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT salary_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT salary_settings_user_id_year_month_key UNIQUE (user_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_salary_settings_user_year ON public.salary_settings (user_id, year);

-- salary_payments table
CREATE TABLE IF NOT EXISTS public.salary_payments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    date date NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT salary_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_salary_payments_user_year ON public.salary_payments (user_id, year);
CREATE INDEX IF NOT EXISTS idx_salary_payments_user_year_month ON public.salary_payments (user_id, year, month);

-- cars table
CREATE TABLE IF NOT EXISTS public.cars (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    brand text NOT NULL,
    model text NOT NULL,
    manufacture_month integer,
    manufacture_year integer NOT NULL,
    purchase_date date NOT NULL,
    purchase_mileage integer DEFAULT 0,
    current_mileage integer DEFAULT 0,
    purchase_price numeric(12,2),
    is_active boolean DEFAULT true,
    vin varchar(17),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cars_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- car_fuel table
CREATE TABLE IF NOT EXISTS public.car_fuel (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    car_id uuid NOT NULL,
    date date NOT NULL,
    mileage integer,
    liters numeric(6,2),
    price_per_liter numeric(6,2),
    total_cost numeric(10,2),
    fuel_type text DEFAULT 'АИ-95',
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT car_fuel_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id)
);

-- car_maintenance table
CREATE TABLE IF NOT EXISTS public.car_maintenance (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    car_id uuid NOT NULL,
    date date NOT NULL,
    mileage integer,
    type text NOT NULL,
    description text,
    cost numeric(10,2),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT car_maintenance_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id)
);

-- car_expenses table
CREATE TABLE IF NOT EXISTS public.car_expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    car_id uuid NOT NULL,
    date date NOT NULL,
    category text NOT NULL,
    description text,
    cost numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT car_expenses_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id)
);

-- car_calendar_events table
CREATE TABLE IF NOT EXISTS public.car_calendar_events (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    car_id uuid NOT NULL,
    date date NOT NULL,
    event_type text NOT NULL,
    reference_id uuid,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT car_calendar_events_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id)
);

-- body_weight table
CREATE TABLE IF NOT EXISTS public.body_weight (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    date date NOT NULL,
    weight numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT body_weight_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT body_weight_user_id_date_key UNIQUE (user_id, date)
);

-- body_params table
CREATE TABLE IF NOT EXISTS public.body_params (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    date date NOT NULL,
    bicep_left numeric(5,1),
    bicep_right numeric(5,1),
    forearm_left numeric(5,1),
    forearm_right numeric(5,1),
    chest numeric(5,1),
    shoulders numeric(5,1),
    waist numeric(5,1),
    glutes numeric(5,1),
    calf_left numeric(5,1),
    calf_right numeric(5,1),
    thigh_left numeric(5,1),
    thigh_right numeric(5,1),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT body_params_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- notes table
CREATE TABLE IF NOT EXISTS public.notes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text,
    is_pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- rent_records table
CREATE TABLE IF NOT EXISTS public.rent_records (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    rent_amount numeric(12,2) DEFAULT 0,
    utilities_amount numeric(12,2) DEFAULT 0,
    cold_water numeric(12,2) DEFAULT 0,
    hot_water numeric(12,2) DEFAULT 0,
    electricity jsonb DEFAULT '[]'::jsonb,
    paid boolean DEFAULT false,
    notes text,
    water_amount numeric(12,2) DEFAULT 0,
    electricity_amount numeric(12,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rent_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT rent_records_user_id_year_month_key UNIQUE (user_id, year, month)
);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
