-- ============================================================================
-- QUICKHIRE PRODUCTION DATABASE AUDIT & ADDITIVE REPAIR MIGRATION
-- Migration Name: 20261023130000_audit_and_rls_security_fix.sql
-- Description: Minimal, additive, production-safe schema repair and RLS policy fix.
-- Rules Adhered To:
--   1. Zero destructive actions: NO DROP TABLE, NO TRUNCATE, NO DATA DELETION.
--   2. Preserves all existing records, relationships, and foreign keys.
--   3. All statements are IF NOT EXISTS / idempotent and safe to rerun.
--   4. RLS policies secure personal data while permitting authorized reads/writes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PRE-MIGRATION AUDIT QUERIES (RUN IN SUPABASE SQL EDITOR FIRST)
-- ----------------------------------------------------------------------------
/*
-- 1.1 Verify existing table presence and row counts:
SELECT table_name,
       (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count
FROM (
  SELECT table_name,
         query_to_xml(format('SELECT count(*) as cnt FROM %I.%I', table_schema, table_name), false, true, '') as xml_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('profiles', 'workers', 'jobs', 'job_records', 'equipment', 'direct_payments', 'worker_reviews')
) t;

-- 1.2 Check for any duplicate phone numbers in profiles:
SELECT phone_number, COUNT(*)
FROM public.profiles
WHERE phone_number IS NOT NULL AND phone_number <> ''
GROUP BY phone_number
HAVING COUNT(*) > 1;

-- 1.3 Inspect current RLS policies:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
*/

-- ----------------------------------------------------------------------------
-- SECTION 2: ADDITIVE COLUMNS (STRICTLY SAFE & BACKWARD-COMPATIBLE)
-- ----------------------------------------------------------------------------

-- 2.1 Additive columns on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS village text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS skills text[],
  ADD COLUMN IF NOT EXISTS experience_years integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_wage numeric DEFAULT 500,
  ADD COLUMN IF NOT EXISTS is_assisted_profile boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';

-- 2.2 Additive columns on public.workers
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS experience_description text,
  ADD COLUMN IF NOT EXISTS preferred_work_location text,
  ADD COLUMN IF NOT EXISTS availability_status text DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS location text;

-- 2.3 Additive columns on public.equipment
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS daily_rent numeric,
  ADD COLUMN IF NOT EXISTS deposit_required numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Sync equipment daily_rate to daily_rent if null
UPDATE public.equipment
SET daily_rent = COALESCE(daily_rent, daily_rate, 500)
WHERE daily_rent IS NULL;

-- ----------------------------------------------------------------------------
-- SECTION 3: ADDITIVE INDEXES (PERFORMANCE & SCALABILITY)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON public.profiles(role, account_status);

CREATE INDEX IF NOT EXISTS idx_workers_category_available
  ON public.workers(category, is_available);

CREATE INDEX IF NOT EXISTS idx_equipment_owner_id
  ON public.equipment(owner_id);

CREATE INDEX IF NOT EXISTS idx_equipment_category_status
  ON public.equipment(category, status);

CREATE INDEX IF NOT EXISTS idx_job_records_job_worker
  ON public.job_records(job_id, worker_id);

CREATE INDEX IF NOT EXISTS idx_jobs_employer_created
  ON public.jobs(employer_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- SECTION 4: ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- 4.1 Enable RLS on core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- 4.2 Profiles Policies
DROP POLICY IF EXISTS "Public profiles read policy" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read of active profiles" ON public.profiles;
CREATE POLICY "Allow public read of active profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (account_status IS NULL OR account_status = 'active');

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR (is_assisted_profile = true AND auth.uid() = created_by)
  );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR (is_assisted_profile = true AND auth.uid() = created_by)
  )
  WITH CHECK (
    auth.uid() = id
    OR (is_assisted_profile = true AND auth.uid() = created_by)
  );

-- 4.3 Workers Policies
DROP POLICY IF EXISTS "Public workers read policy" ON public.workers;
DROP POLICY IF EXISTS "Allow public read of workers" ON public.workers;
CREATE POLICY "Allow public read of workers"
  ON public.workers
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Workers insert policy" ON public.workers;
CREATE POLICY "Workers insert policy"
  ON public.workers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workers.id AND p.is_assisted_profile = true AND p.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workers update policy" ON public.workers;
CREATE POLICY "Workers update policy"
  ON public.workers
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workers.id AND p.is_assisted_profile = true AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workers.id AND p.is_assisted_profile = true AND p.created_by = auth.uid()
    )
  );

-- 4.4 Equipment Policies
DROP POLICY IF EXISTS "Public equipment read policy" ON public.equipment;
DROP POLICY IF EXISTS "Allow public read of equipment" ON public.equipment;
CREATE POLICY "Allow public read of equipment"
  ON public.equipment
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Owners can insert equipment" ON public.equipment;
CREATE POLICY "Owners can insert equipment"
  ON public.equipment
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update equipment" ON public.equipment;
CREATE POLICY "Owners can update equipment"
  ON public.equipment
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete equipment" ON public.equipment;
CREATE POLICY "Owners can delete equipment"
  ON public.equipment
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- 4.5 Job Records Policies
DROP POLICY IF EXISTS "Workers can apply for jobs" ON public.job_records;
CREATE POLICY "Workers can apply for jobs"
  ON public.job_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Participants can view job records" ON public.job_records;
CREATE POLICY "Participants can view job records"
  ON public.job_records
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = worker_id
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Employers can update applicant status" ON public.job_records;
CREATE POLICY "Employers can update applicant status"
  ON public.job_records
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = worker_id
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- SECTION 5: POST-MIGRATION VERIFICATION QUERIES
-- ----------------------------------------------------------------------------
/*
-- 5.1 Verify column additions:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('gender', 'date_of_birth', 'address_line', 'village', 'skills', 'experience_years', 'account_status');

-- 5.2 Verify active policies on equipment and job_records:
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('equipment', 'job_records', 'profiles', 'workers')
ORDER BY tablename, cmd;

-- 5.3 Verify indexes exist:
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_profiles_role_status',
    'idx_workers_category_available',
    'idx_equipment_owner_id',
    'idx_job_records_job_worker',
    'idx_jobs_employer_created'
  );
*/

-- ----------------------------------------------------------------------------
-- SECTION 6: ROLLBACK CONSIDERATIONS
-- ----------------------------------------------------------------------------
/*
-- If any policy adjustment needs to be rolled back without losing data:
-- DROP POLICY IF EXISTS "Owners can update equipment" ON public.equipment;
-- DROP POLICY IF EXISTS "Owners can delete equipment" ON public.equipment;
-- Note: Additive columns and indexes do not need to be dropped as they are backward-compatible.
*/
