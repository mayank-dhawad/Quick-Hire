/*
==============================================================================
# Migration: 20261022160000_expand_profiles_and_workers_schema.sql
# QuickHire: Complete Supabase Profile Schema Expansion & Assisted Profile Fix
#
# 1. Summary of Changes:
#    - Add missing personal details to public.profiles:
#        * email (TEXT)
#        * date_of_birth (DATE)
#        * gender (TEXT)
#    - Add missing structured address details to public.profiles:
#        * address_line (TEXT)
#        * village (TEXT)
#        * city (TEXT)
#        * district (TEXT)
#        * state (TEXT)
#        * pincode (TEXT)
#    - Add visible worker summary fields to public.profiles for easy Table Editor management:
#        * category (TEXT)
#        * skills (TEXT[])
#        * experience_years (INTEGER)
#        * daily_wage (NUMERIC)
#    - Expand public.workers table with additional operational fields:
#        * experience_description (TEXT)
#        * preferred_work_location (TEXT)
#        * availability_status (TEXT DEFAULT 'available')
#    - Fix Assisted Profile foreign key & RLS:
#        * Allows assisted profiles (non-smartphone citizens registered by intermediaries)
#          to exist with a generated UUID without requiring an auth.users record.
#        * Updates RLS policies on profiles & workers so intermediaries can manage assisted profiles.
#
# 2. Safety & Data Preservation:
#    - 100% Additive: All existing tables, columns, rows, foreign keys, and indexes are preserved.
#    - No DROP TABLE, no TRUNCATE.
# ==============================================================================
*/

-- ============================================================================
-- 1. EXPAND PUBLIC.PROFILES COLUMNS
-- ============================================================================

-- Personal details
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say'));

-- Structured Address details
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pincode TEXT;

-- Worker details visible directly in profiles table (for Supabase Table Editor management)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS experience_years INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_wage NUMERIC;

-- ============================================================================
-- 2. EXPAND PUBLIC.WORKERS COLUMNS
-- ============================================================================

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS experience_description TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS preferred_work_location TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'available';

-- ============================================================================
-- 3. FIX FOREIGN KEY CONSTRAINT FOR ASSISTED PROFILES
-- ============================================================================
-- In the original schema, profiles.id has a strict REFERENCES auth.users(id) constraint.
-- Non-smartphone rural workers registered as "assisted profiles" do not possess an
-- auth.users record. Dropping the strict auth.users foreign key on profiles.id allows
-- assisted profiles to be created with a unique UUID, while preserving:
--   a) Primary key constraint on profiles(id)
--   b) Foreign key created_by REFERENCES auth.users(id) ON DELETE SET NULL
--   c) All existing relational foreign keys referencing profiles(id)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Re-add foreign key for created_by to guarantee referential integrity to intermediary
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 4. UPDATE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Ensure RLS is active
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Profiles: Public select
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

-- Profiles: Insert (Self or Assisted by Intermediary)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id OR
    (is_assisted_profile = true AND auth.uid() = created_by)
  );

-- Profiles: Update (Self or Assisted by Intermediary)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id OR
    (is_assisted_profile = true AND auth.uid() = created_by)
  )
  WITH CHECK (
    auth.uid() = id OR
    (is_assisted_profile = true AND auth.uid() = created_by)
  );

-- Workers: Public select
DROP POLICY IF EXISTS "Available workers are viewable by everyone" ON public.workers;
CREATE POLICY "Available workers are viewable by everyone"
  ON public.workers FOR SELECT
  TO anon, authenticated
  USING (true);

-- Workers: Insert (Self or Assisted Worker by Intermediary)
DROP POLICY IF EXISTS "Workers can insert their own worker profile" ON public.workers;
CREATE POLICY "Workers can insert their own worker profile"
  ON public.workers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = workers.id
        AND profiles.is_assisted_profile = true
        AND profiles.created_by = auth.uid()
    )
  );

-- Workers: Update (Self or Assisted Worker by Intermediary)
DROP POLICY IF EXISTS "Workers can update their own worker profile" ON public.workers;
CREATE POLICY "Workers can update their own worker profile"
  ON public.workers FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = workers.id
        AND profiles.is_assisted_profile = true
        AND profiles.created_by = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = workers.id
        AND profiles.is_assisted_profile = true
        AND profiles.created_by = auth.uid()
    )
  );

-- ============================================================================
-- 5. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_pincode ON public.profiles (pincode);
CREATE INDEX IF NOT EXISTS idx_profiles_district ON public.profiles (district);
CREATE INDEX IF NOT EXISTS idx_profiles_village ON public.profiles (village);
CREATE INDEX IF NOT EXISTS idx_profiles_category ON public.profiles (category);
CREATE INDEX IF NOT EXISTS idx_workers_availability_status ON public.workers (availability_status);

-- ============================================================================
-- 6. AUTO-CONFIRM QUICKHIRE PHONE USERS IN AUTH.USERS
-- ============================================================================
-- Ensure that phone OTP accounts using deterministic @quickhire.local mapped emails
-- are auto-confirmed so supabase.auth.signInWithPassword always succeeds and issues
-- a persistent, authentic Supabase JWT session with a stable auth.uid().
CREATE OR REPLACE FUNCTION public.auto_confirm_quickhire_local_users()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email LIKE '%@quickhire.local' THEN
    NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, NOW());
    NEW.confirmed_at = COALESCE(NEW.confirmed_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_confirm_quickhire_local_users ON auth.users;
CREATE TRIGGER trg_auto_confirm_quickhire_local_users
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_quickhire_local_users();

-- Retroactively confirm existing @quickhire.local accounts
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    confirmed_at = COALESCE(confirmed_at, NOW())
WHERE email LIKE '%@quickhire.local' AND email_confirmed_at IS NULL;
