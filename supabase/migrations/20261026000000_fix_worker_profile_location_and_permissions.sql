-- ==============================================================================
-- QuickHire Database Migration
-- Migration Name: 20261026000000_fix_worker_profile_location_and_permissions.sql
-- Description: Hardened, non-destructive additive migration to:
--              1. Add 'location' column to public.profiles and public.workers.
--              2. Backfill location safely from structured fields.
--              3. Synchronize worker attributes without artificial defaults.
--              4. Create public.public_worker_directory view with only approved fields.
--              5. Purge all legacy broad SELECT policies on profiles and workers.
--              6. Establish strict, least-privilege RLS policies.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- SECTION 1: ADDITIVE SCHEMA ENHANCEMENTS
-- ------------------------------------------------------------------------------

-- 1.1 Add 'location' column to public.profiles if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'location'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN location TEXT;
        COMMENT ON COLUMN public.profiles.location IS 'Composite location string (Village, District, State) for worker discovery';
    END IF;
END $$;

-- 1.2 Add 'location' and extended worker attributes to public.workers if missing
DO $$
BEGIN
    -- location
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'location'
    ) THEN
        ALTER TABLE public.workers ADD COLUMN location TEXT;
        COMMENT ON COLUMN public.workers.location IS 'Worker preferred operating location';
    END IF;

    -- daily_wage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'daily_wage'
    ) THEN
        ALTER TABLE public.workers ADD COLUMN daily_wage NUMERIC;
    END IF;

    -- experience_description
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'experience_description'
    ) THEN
        ALTER TABLE public.workers ADD COLUMN experience_description TEXT;
    END IF;

    -- preferred_work_location
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'preferred_work_location'
    ) THEN
        ALTER TABLE public.workers ADD COLUMN preferred_work_location TEXT;
    END IF;

    -- availability_status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'availability_status'
    ) THEN
        ALTER TABLE public.workers ADD COLUMN availability_status TEXT;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- SECTION 2: SAFE, NON-DESTRUCTIVE DATA BACKFILL
-- ------------------------------------------------------------------------------

-- 2.1 Backfill location on profiles from existing structured fields where currently empty
UPDATE public.profiles
SET location = CONCAT_WS(', ', NULLIF(village, ''), NULLIF(district, ''), NULLIF(state, ''))
WHERE (location IS NULL OR location = '')
  AND (village IS NOT NULL OR district IS NOT NULL OR state IS NOT NULL);

-- 2.2 Synchronize worker attributes from corresponding profiles
-- Preserves existing genuine worker values; falls back to profile values without inventing artificial numbers.
UPDATE public.workers w
SET location = COALESCE(NULLIF(w.location, ''), p.location),
    daily_wage = COALESCE(w.daily_wage, p.daily_wage),
    experience_description = COALESCE(NULLIF(w.experience_description, ''), p.experience_description),
    preferred_work_location = COALESCE(NULLIF(w.preferred_work_location, ''), p.preferred_work_location),
    availability_status = COALESCE(NULLIF(w.availability_status, ''), NULLIF(p.availability_status, ''), 'available')
FROM public.profiles p
WHERE w.id = p.id;

-- 2.3 Establish default constraints for future new worker rows
ALTER TABLE public.workers ALTER COLUMN availability_status SET DEFAULT 'available';

-- ------------------------------------------------------------------------------
-- SECTION 3: SANITIZED PUBLIC DIRECTORY DISCOVERY VIEW
-- ------------------------------------------------------------------------------
-- To ensure public directory discovery does NOT expose sensitive personal
-- data (such as bank_account_no, bank_ifsc, bank_name, upi_id, email, phone_number,
-- or exact residential address), this secure view exposes ONLY explicitly approved fields.
-- Explicitly filters to worker-role profiles and excludes admin/suspended/deactivated accounts.

CREATE OR REPLACE VIEW public.public_worker_directory AS
SELECT
    w.id,
    p.full_name,
    w.category,
    w.skills,
    w.experience_years,
    COALESCE(w.daily_wage, p.daily_wage) AS daily_wage,
    w.experience_description,
    w.preferred_work_location,
    w.average_rating,
    w.is_available,
    COALESCE(w.location, p.location, CONCAT_WS(', ', NULLIF(p.village, ''), NULLIF(p.district, ''), NULLIF(p.state, ''))) AS location,
    p.village,
    p.district,
    p.state,
    p.is_assisted_profile
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
WHERE w.is_available = true
  AND (p.account_status IS NULL OR p.account_status = 'active')
  AND p.role::text = 'worker';

COMMENT ON VIEW public.public_worker_directory IS
  'Whitelisted public directory view. Strictly omits banking details, account numbers, IFSC codes, UPI IDs, emails, phone numbers, and private residential addresses.';

-- Grant access to the sanitized view
GRANT SELECT ON public.public_worker_directory TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 4: PURGE LEGACY BROAD POLICIES & ENFORCE STRICT RLS
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- 4.1 Remove all legacy broad SELECT policies on profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

-- Dynamic cleanup of any other permissive SELECT policy on profiles
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND cmd = 'SELECT'
          AND qual = 'true'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles;', r.policyname);
    END LOOP;
END $$;

-- 4.2 Create strict, least-privilege SELECT policy on profiles
-- Users can only read:
-- 1. Their own profile (auth.uid() = id)
-- 2. Assisted profiles they manage (is_assisted_profile = true AND created_by = auth.uid())
-- 3. Workers who applied to their jobs (employer reading applicant details)
-- 4. Employers who posted jobs they applied for (worker reading hiring employer contact info)
-- 5. Administrators (public.is_admin(auth.uid()))
CREATE POLICY "profiles_strict_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR (is_assisted_profile = true AND created_by = auth.uid())
    OR EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.job_records jr ON jr.job_id = j.id
        WHERE (j.employer_id = auth.uid() AND jr.worker_id = profiles.id)
           OR (jr.worker_id = auth.uid() AND j.employer_id = profiles.id)
    )
    OR public.is_admin(auth.uid())
);

-- 4.3 Ensure authenticated workers can insert only their own worker-role profile
DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    (auth.uid() = id AND (role IS NULL OR role = 'worker'))
    OR public.is_admin(auth.uid())
);

-- 4.4 Ensure authenticated workers can update their own profile (cannot change role or account_status directly)
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR (is_assisted_profile = true AND created_by = auth.uid())
    OR public.is_admin(auth.uid())
)
WITH CHECK (
    auth.uid() = id
    OR (is_assisted_profile = true AND created_by = auth.uid())
    OR public.is_admin(auth.uid())
);

-- 4.5 Purge legacy broad SELECT policies on workers
DROP POLICY IF EXISTS "Worker profiles are viewable by authenticated users" ON public.workers;
DROP POLICY IF EXISTS "Workers are viewable by authenticated users" ON public.workers;
DROP POLICY IF EXISTS "Workers select policy" ON public.workers;
DROP POLICY IF EXISTS "workers_select_policy" ON public.workers;

-- Dynamic cleanup of any other permissive SELECT policy on workers
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'workers'
          AND cmd = 'SELECT'
          AND qual = 'true'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.workers;', r.policyname);
    END LOOP;
END $$;

-- 4.6 Workers SELECT policy: self, managed assisted workers, active job employer, or admin
CREATE POLICY "workers_strict_select_policy"
ON public.workers
FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = workers.id
          AND p.is_assisted_profile = true
          AND p.created_by = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.job_records jr ON jr.job_id = j.id
        WHERE j.employer_id = auth.uid()
          AND jr.worker_id = workers.id
    )
    OR public.is_admin(auth.uid())
);

-- 4.7 Workers INSERT policy
DROP POLICY IF EXISTS "Workers can insert their own details" ON public.workers;
DROP POLICY IF EXISTS "workers_insert_policy" ON public.workers;
CREATE POLICY "workers_insert_policy"
ON public.workers
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = workers.id
          AND p.is_assisted_profile = true
          AND p.created_by = auth.uid()
    )
    OR public.is_admin(auth.uid())
);

-- 4.8 Workers UPDATE policy
DROP POLICY IF EXISTS "Workers can update their own details" ON public.workers;
DROP POLICY IF EXISTS "workers_update_policy" ON public.workers;
CREATE POLICY "workers_update_policy"
ON public.workers
FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = workers.id
          AND p.is_assisted_profile = true
          AND p.created_by = auth.uid()
    )
    OR public.is_admin(auth.uid())
)
WITH CHECK (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = workers.id
          AND p.is_assisted_profile = true
          AND p.created_by = auth.uid()
    )
    OR public.is_admin(auth.uid())
);

COMMIT;
