/*
==============================================================================
# QuickHire Unified Master Schema Setup
# Consolidated single-script execution for new Supabase projects
# Includes all tables, enums, foreign keys, indexes, and Row Level Security (RLS)
# Full UTF-8 Unicode Support (Devanagari, Bengali, Telugu, Latin)
==============================================================================
*/

-- 1. Create Enums if not existing
DO $$ BEGIN
  CREATE TYPE public.job_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('employer', 'worker', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.worker_category AS ENUM ('Agriculture', 'Construction', 'Daily work', 'Skilled self-employed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.equipment_status AS ENUM ('available', 'rented', 'maintenance');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Profiles Table (Citizens, Workers, Employers, Admins)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('worker', 'employer', 'admin')),
  full_name text NOT NULL DEFAULT '',
  phone_number text,
  is_assisted_profile boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  location text,
  account_status text DEFAULT 'active',
  bank_name text,
  bank_account_no text,
  bank_ifsc text,
  upi_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id OR (is_assisted_profile = true AND auth.uid() = created_by));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR (is_assisted_profile = true AND auth.uid() = created_by))
  WITH CHECK (auth.uid() = id OR (is_assisted_profile = true AND auth.uid() = created_by));

CREATE INDEX IF NOT EXISTS profiles_phone_number_idx ON public.profiles (phone_number);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- 3. Workers Table (Skill profiles, availability, ratings)
CREATE TABLE IF NOT EXISTS public.workers (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Agriculture', 'Construction', 'Daily work', 'Skilled self-employed')),
  skills text[] DEFAULT '{}'::text[],
  experience_years integer DEFAULT 1,
  daily_wage numeric DEFAULT 500,
  average_rating numeric DEFAULT 5.0,
  is_available boolean DEFAULT true,
  location text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Available workers are viewable by everyone" ON public.workers;
CREATE POLICY "Available workers are viewable by everyone"
  ON public.workers FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Workers can insert their own worker profile" ON public.workers;
CREATE POLICY "Workers can insert their own worker profile"
  ON public.workers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Workers can update their own worker profile" ON public.workers;
CREATE POLICY "Workers can update their own worker profile"
  ON public.workers FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS workers_category_idx ON public.workers (category);
CREATE INDEX IF NOT EXISTS workers_is_available_idx ON public.workers (is_available);

-- 4. Jobs Table (Job listings posted by employers)
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  required_skills text[] DEFAULT '{}'::text[],
  offered_wages numeric NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Jobs are viewable by everyone" ON public.jobs;
CREATE POLICY "Jobs are viewable by everyone"
  ON public.jobs FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;
CREATE POLICY "Employers can insert jobs"
  ON public.jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employer_id);

DROP POLICY IF EXISTS "Employers can update their own jobs" ON public.jobs;
CREATE POLICY "Employers can update their own jobs"
  ON public.jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = employer_id)
  WITH CHECK (auth.uid() = employer_id);

CREATE INDEX IF NOT EXISTS jobs_status_created_at_idx ON public.jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_employer_id_idx ON public.jobs (employer_id);

-- 5. Job Records Table (Applications / Interest connections)
CREATE TABLE IF NOT EXISTS public.job_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'contacted',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT job_records_unique_job_worker UNIQUE (job_id, worker_id)
);

ALTER TABLE public.job_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job records viewable by involved workers and employers" ON public.job_records;
CREATE POLICY "Job records viewable by involved workers and employers"
  ON public.job_records FOR SELECT
  TO authenticated
  USING (
    auth.uid() = worker_id OR
    auth.uid() IN (SELECT employer_id FROM public.jobs WHERE id = job_id)
  );

DROP POLICY IF EXISTS "Workers can record job interest" ON public.job_records;
CREATE POLICY "Workers can record job interest"
  ON public.job_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Involved parties can update job records" ON public.job_records;
CREATE POLICY "Involved parties can update job records"
  ON public.job_records FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = worker_id OR
    auth.uid() IN (SELECT employer_id FROM public.jobs WHERE id = job_id)
  );

CREATE INDEX IF NOT EXISTS job_records_job_id_idx ON public.job_records (job_id);
CREATE INDEX IF NOT EXISTS job_records_worker_id_idx ON public.job_records (worker_id);

-- 6. Equipment Rentals Table (Tractors, sprayers, mixers, tools)
CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  description text,
  daily_rent numeric NOT NULL DEFAULT 0,
  deposit_required numeric NOT NULL DEFAULT 0,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipment is viewable by everyone" ON public.equipment;
CREATE POLICY "Equipment is viewable by everyone"
  ON public.equipment FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Owners can post equipment" ON public.equipment;
CREATE POLICY "Owners can post equipment"
  ON public.equipment FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own equipment" ON public.equipment;
CREATE POLICY "Owners can update their own equipment"
  ON public.equipment FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS equipment_owner_id_idx ON public.equipment (owner_id);
CREATE INDEX IF NOT EXISTS equipment_category_idx ON public.equipment (category);
CREATE INDEX IF NOT EXISTS equipment_status_idx ON public.equipment (status);

-- 7. Payments Table (0% commission wage & machinery settlement ledger)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_for_type text NOT NULL CHECK (payment_for_type IN ('worker_wage', 'machine_rental')),
  reference_id text,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Net Banking (IMPS/NEFT)',
  transaction_ref text,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view payments they participated in" ON public.payments;
CREATE POLICY "Users can view payments they participated in"
  ON public.payments FOR SELECT
  TO authenticated
  USING (auth.uid() = payer_id OR auth.uid() = payee_id);

DROP POLICY IF EXISTS "Payers can record payments" ON public.payments;
CREATE POLICY "Payers can record payments"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = payer_id);

CREATE INDEX IF NOT EXISTS payments_payer_id_idx ON public.payments (payer_id);
CREATE INDEX IF NOT EXISTS payments_payee_id_idx ON public.payments (payee_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments (created_at DESC);

-- 8. Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  reviewer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating numeric CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Reviews are viewable by everyone"
  ON public.reviews FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can submit reviews" ON public.reviews;
CREATE POLICY "Authenticated users can submit reviews"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_profile_id);

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'system',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- 10. Phone OTPs Table (Fast2SMS Gateway temporary verification records)
CREATE TABLE IF NOT EXISTS public.phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON public.phone_otps(phone);

ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert to phone_otps" ON public.phone_otps;
CREATE POLICY "Allow public insert to phone_otps"
  ON public.phone_otps FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select from phone_otps" ON public.phone_otps;
CREATE POLICY "Allow public select from phone_otps"
  ON public.phone_otps FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public delete from phone_otps" ON public.phone_otps;
CREATE POLICY "Allow public delete from phone_otps"
  ON public.phone_otps FOR DELETE
  USING (true);

-- 11. QuickHire Interest Table (Public landing lead generation)
CREATE TABLE IF NOT EXISTS public.quickhire_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('worker', 'employer')),
  name text NOT NULL,
  phone text NOT NULL,
  village text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quickhire_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can read QuickHire interest"
  ON public.quickhire_interest FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can create QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can create QuickHire interest"
  ON public.quickhire_interest FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can update QuickHire interest"
  ON public.quickhire_interest FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can delete QuickHire interest"
  ON public.quickhire_interest FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS quickhire_interest_created_at_idx ON public.quickhire_interest (created_at DESC);
