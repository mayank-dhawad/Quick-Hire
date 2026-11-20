/*
# Unified Base Schema Migration for QuickHire Rural DPI Platform
# 
# 1. Base Tables Created:
#    - public.profiles: User profiles (workers, employers & admins), contact, banking & verification info.
#    - public.workers: Worker skill profiles, categories, daily wage, rating, and availability.
#    - public.jobs: Job postings by employers with skill requirements, offered wages, and location.
#    - public.job_records: Application & hiring status between jobs and workers.
#    - public.equipment: Tool and machinery rentals (tractors, tillers, sprayers) posted by owners.
#    - public.payments: Direct bank / UPI settlement receipts between employers and workers/owners.
#    - public.reviews: Peer and employer feedback / ratings for completed work.
#    - public.notifications: Platform notifications and SMS/status updates for citizens.
#
# 2. Security & Row Level Security (RLS):
#    - RLS enabled on all tables.
#    - Public read access for discoverability of jobs, workers, and machinery.
#    - User-scoped write permissions (auth.uid() matching owner/profile id).
#
# 3. Unicode & Regional Script Support:
#    - Full UTF-8 multi-byte support for Hindi, Marathi, Bengali, Telugu, and English.
*/

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================
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

-- Ensure all columns exist even if table was pre-existing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_assisted_profile boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_no text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_ifsc text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS upi_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

-- ============================================================================
-- 2. WORKERS TABLE
-- ============================================================================
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

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}'::text[];
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS experience_years integer DEFAULT 1;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS daily_wage numeric DEFAULT 500;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS average_rating numeric DEFAULT 5.0;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

-- ============================================================================
-- 3. JOBS TABLE
-- ============================================================================
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

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS employer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS required_skills text[] DEFAULT '{}'::text[];
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS offered_wages numeric DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

-- ============================================================================
-- 4. JOB RECORDS (APPLICATIONS / INTERESTS) TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'contacted',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT job_records_unique_job_worker UNIQUE (job_id, worker_id)
);

ALTER TABLE public.job_records ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.job_records ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.job_records ADD COLUMN IF NOT EXISTS status text DEFAULT 'contacted';
ALTER TABLE public.job_records ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

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

-- ============================================================================
-- 5. EQUIPMENT RENTALS TABLE
-- ============================================================================
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

ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS daily_rent numeric DEFAULT 0;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS deposit_required numeric DEFAULT 0;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS location text DEFAULT '';
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS status text DEFAULT 'available';
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

-- ============================================================================
-- 6. PAYMENTS TABLE
-- ============================================================================
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

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_for_type text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'Net Banking (IMPS/NEFT)';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_ref text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

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

-- ============================================================================
-- 7. REVIEWS & RATINGS TABLE
-- ============================================================================
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

-- ============================================================================
-- 8. NOTIFICATIONS TABLE
-- ============================================================================
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
