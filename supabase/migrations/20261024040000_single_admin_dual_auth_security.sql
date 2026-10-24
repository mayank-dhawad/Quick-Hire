-- ============================================================================
-- QUICKHIRE SECURITY FOUNDATION: SINGLE-ADMIN DUAL-AUTH & DATABASE PROTECTION
-- Migration Name: 20261024040000_single_admin_dual_auth_security.sql
-- Description:
--   1. Authoritative public.admin_users table linked to auth.users(id).
--   2. Strict single-administrator invariant enforced via database trigger.
--   3. Authoritative server-side is_admin() function with pinned search_path.
--      Zero fallback to profiles table. Zero anonymous execution.
--   4. Trusted verify_admin_access() checking real auth.users confirmation timestamps.
--   5. Trusted provision_designated_administrator() procedure verifying real identities.
--   6. Strict table-by-table RLS policy matrix across all application tables.
--   7. Append-only, immutable audit ledger (admin_audit_logs) with revoked UPDATE/DELETE/TRUNCATE.
--   8. Anti-self-promotion trigger protecting profiles role column.
-- Rules Adhered To:
--   - 100% Non-destructive: No DROP TABLE, no TRUNCATE, no data deletion.
--   - Idempotent and safe to run in any environment (IF NOT EXISTS).
--   - Preserves all existing worker profiles, job listings, and work history.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PUBLIC.ADMIN_USERS TABLE (AUTHORITATIVE IDENTITY SOURCE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'moderator', 'support_agent')),
  permissions text[] DEFAULT '{"all"}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  email_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  verified_email text,
  verified_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS verified_email text;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS verified_phone text;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'super_admin';

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_active_role ON public.admin_users(is_active, role);

-- Invariant Enforcement: Exactly one active administrator is permitted in the system.
CREATE OR REPLACE FUNCTION public.check_single_admin_constraint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.admin_users WHERE is_active = true) >= 1 THEN
      RAISE EXCEPTION 'QuickHire Security Violation: Multiple active administrator identities are prohibited. Only one designated administrator is permitted.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_active = true AND (OLD.is_active IS NULL OR OLD.is_active = false) THEN
      IF (SELECT count(*) FROM public.admin_users WHERE is_active = true AND id <> NEW.id) >= 1 THEN
        RAISE EXCEPTION 'QuickHire Security Violation: Cannot activate multiple administrator accounts.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_single_admin_constraint ON public.admin_users;
CREATE TRIGGER trg_check_single_admin_constraint
  BEFORE INSERT OR UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_single_admin_constraint();

-- ----------------------------------------------------------------------------
-- SECTION 2: SERVER-ENFORCED AUTHORIZATION FUNCTIONS
-- ----------------------------------------------------------------------------

-- Authoritative is_admin function
-- Pinned search_path, security definer, STABLE
-- Checks ONLY public.admin_users. Zero fallback to profiles.role.
CREATE OR REPLACE FUNCTION public.is_admin(check_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF check_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Security barrier: ordinary authenticated callers cannot probe arbitrary user IDs
  IF v_caller_id IS NOT NULL AND check_uid <> v_caller_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = v_caller_id AND is_active = true
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Anonymous callers cannot probe any user IDs
  IF v_caller_id IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
    RETURN false;
  END IF;

  -- Single authoritative source of truth: active record in admin_users
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = check_uid AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;

-- Server RPC for verified admin access with real identity confirmation from auth.users
CREATE OR REPLACE FUNCTION public.verify_admin_access(check_uid uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_admin record;
  v_auth_user record;
BEGIN
  IF check_uid IS NULL THEN
    RETURN jsonb_build_object('is_admin', false, 'reason', 'unauthenticated');
  END IF;

  -- Prevent arbitrary probing by unauthorized callers
  IF v_caller_id IS NOT NULL AND check_uid <> v_caller_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = v_caller_id AND is_active = true) THEN
      RETURN jsonb_build_object('is_admin', false, 'reason', 'unauthorized_probe');
    END IF;
  END IF;

  SELECT * INTO v_admin FROM public.admin_users
  WHERE user_id = check_uid AND is_active = true;

  IF v_admin IS NULL THEN
    RETURN jsonb_build_object('is_admin', false, 'reason', 'not_admin');
  END IF;

  -- Inspect real confirmation status directly from auth.users (cannot be spoofed)
  SELECT id, email, phone, email_confirmed_at, phone_confirmed_at
  INTO v_auth_user
  FROM auth.users
  WHERE id = check_uid;

  RETURN jsonb_build_object(
    'is_admin', true,
    'user_id', v_admin.user_id,
    'role', v_admin.role,
    'permissions', v_admin.permissions,
    'verified_email', v_admin.verified_email,
    'verified_phone', v_admin.verified_phone,
    'email_verified', (v_auth_user.email_confirmed_at IS NOT NULL),
    'phone_verified', (v_auth_user.phone_confirmed_at IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_access(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_admin_access(uuid) FROM anon, public;

-- ----------------------------------------------------------------------------
-- SECTION 3: TRUSTED ADMINISTRATOR PROVISIONING PROCEDURE
-- ----------------------------------------------------------------------------
-- Must be executed only by postgres/service_role via Supabase SQL Editor.
-- Does NOT mark phone_verified or email_verified unless confirmed by GoTrue in auth.users.
CREATE OR REPLACE FUNCTION public.provision_designated_administrator(
  target_user_id uuid,
  authorized_email text,
  authorized_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user record;
  v_clean_email text := lower(trim(authorized_email));
  v_clean_phone text := trim(authorized_phone);
BEGIN
  -- Strict permission guard: Only postgres or service_role can provision administrators
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Access Denied: Only database superuser (postgres) can execute administrator provisioning.';
  END IF;

  -- 1. Verify that the target user actually exists in auth.users
  SELECT id, email, phone, email_confirmed_at, phone_confirmed_at
  INTO v_user
  FROM auth.users
  WHERE id = target_user_id;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Provisioning Failed: User UUID % does not exist in auth.users. The account must be created in Supabase Auth first.', target_user_id;
  END IF;

  -- 2. Verify that the provided email matches auth.users
  IF v_user.email IS NOT NULL AND lower(trim(v_user.email)) <> v_clean_email THEN
    RAISE EXCEPTION 'Provisioning Failed: Provided email (%) does not match the registered auth.users email (%).', v_clean_email, v_user.email;
  END IF;

  -- 3. Verify or attach phone in auth.users
  IF v_user.phone IS NOT NULL AND v_user.phone <> '' THEN
    IF v_user.phone <> v_clean_phone THEN
      RAISE EXCEPTION 'Provisioning Failed: Provided phone (%) does not match the registered auth.users phone (%).', v_clean_phone, v_user.phone;
    END IF;
  ELSE
    UPDATE auth.users
    SET phone = v_clean_phone
    WHERE id = target_user_id;
  END IF;

  -- 4. Insert or update the single designated administrator record
  INSERT INTO public.admin_users (
    user_id,
    role,
    permissions,
    is_active,
    verified_email,
    verified_phone,
    email_verified,
    phone_verified,
    updated_at
  )
  VALUES (
    target_user_id,
    'super_admin',
    '{"all"}'::text[],
    true,
    v_clean_email,
    v_clean_phone,
    (v_user.email_confirmed_at IS NOT NULL),
    (v_user.phone_confirmed_at IS NOT NULL),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'super_admin',
    is_active = true,
    verified_email = v_clean_email,
    verified_phone = v_clean_phone,
    email_verified = (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = target_user_id AND u.email_confirmed_at IS NOT NULL)),
    phone_verified = (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = target_user_id AND u.phone_confirmed_at IS NOT NULL)),
    updated_at = now();

  -- 5. Synchronize public.profiles table
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    account_status,
    email,
    phone_number
  )
  VALUES (
    target_user_id,
    'Platform Administrator',
    'admin',
    'active',
    v_clean_email,
    v_clean_phone
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    account_status = 'active',
    email = v_clean_email,
    phone_number = v_clean_phone;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'email', v_clean_email,
    'phone', v_clean_phone,
    'email_confirmed', (v_user.email_confirmed_at IS NOT NULL),
    'phone_confirmed', (v_user.phone_confirmed_at IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_designated_administrator(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.provision_designated_administrator(uuid, text, text) FROM authenticated, anon, public;

-- ----------------------------------------------------------------------------
-- SECTION 4: IMMUTABLE AUDIT LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email text,
  action text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('profile', 'worker', 'job', 'equipment', 'complaint', 'content', 'auth', 'system')),
  target_id text NOT NULL,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_audit_logs FROM public, anon;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM authenticated, anon, public;
GRANT ALL ON public.admin_audit_logs TO service_role;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- SECTION 5: GRIEVANCE MANAGEMENT (COMPLAINTS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_phone text,
  reporter_name text,
  target_type text NOT NULL CHECK (target_type IN ('worker', 'employer', 'job', 'equipment', 'payment', 'platform', 'other')),
  target_id text,
  target_name text,
  category text NOT NULL CHECK (category IN ('unpaid_wages', 'unsafe_conditions', 'harassment', 'fraud', 'misleading_equipment', 'platform_abuse', 'other')),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'investigating', 'resolved', 'dismissed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to text,
  resolution_notes text,
  evidence_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Citizens can view their own complaints or admins can view all" ON public.complaints;
DROP POLICY IF EXISTS "Complaints read policy" ON public.complaints;
CREATE POLICY "Complaints read policy"
  ON public.complaints
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = reporter_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can submit a complaint" ON public.complaints;
DROP POLICY IF EXISTS "Complaints insert policy" ON public.complaints;
CREATE POLICY "Complaints insert policy"
  ON public.complaints
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update complaints" ON public.complaints;
DROP POLICY IF EXISTS "Complaints update policy" ON public.complaints;
CREATE POLICY "Complaints update policy"
  ON public.complaints
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- SECTION 6: TABLE-BY-TABLE ACCESS CONTROL MATRIX & RLS POLICIES
-- ----------------------------------------------------------------------------

-- 6.1 public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of active profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    account_status IS NULL
    OR account_status = 'active'
    OR public.is_admin(auth.uid())
    OR auth.uid() = id
  );

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
CREATE POLICY "Profiles insert policy"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR (is_assisted_profile = true AND auth.uid() = created_by)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR (is_assisted_profile = true AND auth.uid() = created_by)
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = id
    OR (is_assisted_profile = true AND auth.uid() = created_by)
    OR public.is_admin(auth.uid())
  );

-- 6.2 public.workers
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of workers" ON public.workers;
DROP POLICY IF EXISTS "Workers read policy" ON public.workers;
CREATE POLICY "Workers read policy"
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
    OR public.is_admin(auth.uid())
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
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workers.id AND p.is_assisted_profile = true AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workers.id AND p.is_assisted_profile = true AND p.created_by = auth.uid()
    )
  );

-- 6.3 public.jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Jobs are viewable by everyone" ON public.jobs;
DROP POLICY IF EXISTS "Jobs read policy" ON public.jobs;
CREATE POLICY "Jobs read policy"
  ON public.jobs
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Jobs insert policy" ON public.jobs;
CREATE POLICY "Jobs insert policy"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = employer_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Employers can update their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Jobs update policy" ON public.jobs;
CREATE POLICY "Jobs update policy"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = employer_id
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = employer_id
    OR public.is_admin(auth.uid())
  );

-- 6.4 public.job_records
ALTER TABLE public.job_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view job records" ON public.job_records;
DROP POLICY IF EXISTS "Job records read policy" ON public.job_records;
CREATE POLICY "Job records read policy"
  ON public.job_records
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = worker_id
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workers can apply for jobs" ON public.job_records;
DROP POLICY IF EXISTS "Job records insert policy" ON public.job_records;
CREATE POLICY "Job records insert policy"
  ON public.job_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = worker_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Employers can update applicant status" ON public.job_records;
DROP POLICY IF EXISTS "Job records update policy" ON public.job_records;
CREATE POLICY "Job records update policy"
  ON public.job_records
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = worker_id
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = auth.uid()
    )
  );

-- 6.5 public.equipment
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of equipment" ON public.equipment;
DROP POLICY IF EXISTS "Equipment read policy" ON public.equipment;
CREATE POLICY "Equipment read policy"
  ON public.equipment
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Owners can insert equipment" ON public.equipment;
DROP POLICY IF EXISTS "Equipment insert policy" ON public.equipment;
CREATE POLICY "Equipment insert policy"
  ON public.equipment
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Owners can update equipment" ON public.equipment;
DROP POLICY IF EXISTS "Equipment update policy" ON public.equipment;
CREATE POLICY "Equipment update policy"
  ON public.equipment
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Owners can delete equipment" ON public.equipment;
DROP POLICY IF EXISTS "Equipment delete policy" ON public.equipment;
CREATE POLICY "Equipment delete policy"
  ON public.equipment
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.is_admin(auth.uid())
  );

-- 6.6 public.admin_users table RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_users FROM public, anon;
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
CREATE POLICY "Admins can view admin_users"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Only super_admin can update administrative records; anon/regular users have 0 write access
DROP POLICY IF EXISTS "Super admins can manage admin_users" ON public.admin_users;
CREATE POLICY "Super admins can manage admin_users"
  ON public.admin_users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- SECTION 7: PROFILE ROLE PRIVILEGE ELEVATION PROTECTION TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' AND NOT public.is_admin(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
      NEW.role := 'worker';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role = 'admin' AND (OLD.role IS NULL OR OLD.role <> 'admin') THEN
      IF NOT public.is_admin(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
        NEW.role := COALESCE(OLD.role, 'worker');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_role
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_role();
