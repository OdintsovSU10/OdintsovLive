CREATE TABLE IF NOT EXISTS body_weight (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  weight numeric(5,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS body_params (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
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
  created_at timestamptz DEFAULT now()
);
