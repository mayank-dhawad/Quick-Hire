-- ============================================================================
-- QUICKHIRE MIGRATION FOUNDATION BOOTSTRAP (IDEMPOTENT PRE-CHECK)
-- File: supabase/migrations/20261018220000_foundation_schema_bootstrap.sql
--
-- Objective:
--   Establishes the four prerequisite base tables (profiles, workers, jobs,
--   equipment) before historical patch migrations (20261019000000 and
--   20261019120000) execute on a fresh local PostgreSQL database.
--
-- Safety & Idempotency:
--   - 100% Non-destructive: No DROP TABLE, no TRUNCATE, no data alteration.
--   - 100% Idempotent: Uses CREATE TABLE IF NOT EXISTS throughout.
--   - Evaluates to a safe no-op on databases where tables already exist.
--   - Preserves all 16 historical migration files without modification.
--   - Leaves policies, triggers, and procedures to their respective migrations.
--
-- Note on CREATE TABLE IF NOT EXISTS:
--   In PostgreSQL, CREATE TABLE IF NOT EXISTS evaluates to a no-op if the
--   relation already exists; it does NOT alter columns or retroactively add
--   constraints to an existing table. Therefore, all column data types,
--   nullability, check constraints, and foreign keys match their original
--   definitions in 20261019130000_unified_base_schema.sql verbatim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Prerequisite for 20261019000000 & 20261019120000)
-- Matches 20261019130000_unified_base_schema.sql lines 26-41 verbatim.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. WORKERS TABLE (Prerequisite for 20261019120000)
-- Matches 20261019130000_unified_base_schema.sql lines 85-96 verbatim.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. JOBS TABLE (Prerequisite for 20261019120000 column comments)
-- Matches 20261019130000_unified_base_schema.sql lines 135-146 verbatim.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4. EQUIPMENT TABLE
-- Matches 20261019130000_unified_base_schema.sql lines 231-243 verbatim,
-- with the addition of the compatibility column `daily_rate numeric DEFAULT 0`
-- to prevent SQLSTATE 42703 when 20261023130000_audit_and_rls_security_fix.sql
-- executes: `UPDATE public.equipment SET daily_rent = COALESCE(daily_rent, daily_rate, 500)`.
-- The application code continues to use `daily_rent` as its canonical field.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  description text,
  daily_rent numeric NOT NULL DEFAULT 0,
  daily_rate numeric DEFAULT 0,
  deposit_required numeric NOT NULL DEFAULT 0,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure daily_rate compatibility column exists if the table was pre-existing
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS daily_rate numeric DEFAULT 0;

