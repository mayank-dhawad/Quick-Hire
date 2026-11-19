-- ==============================================================================
-- QuickHire Database Migration
-- Migration Name: 20261119233000_secure_worker_contact_option3.sql
-- Description: Worker Contact Authorization & Privacy Hardening (Option 3):
--              1. Preserves and codifies all live RPC security checks for public.get_worker_contact_phone:
--                 - SET search_path = pg_catalog, public, auth, pg_temp
--                 - Caller authentication check.
--                 - Explicit p_worker_id IS NULL validation raising SQLSTATE 22004.
--                 - Explicit caller profile existence and active account status validation.
--                 - Self and assisted-profile creator access validation.
--                 - Platform admin access validation.
--                 - Explicit employer role validation (for non-self, non-admin callers).
--                 - Existing jobs-to-job_records connection authorization check.
--                 - Atomic 15 requests / 24-hour rate limit on employer calls.
--                 - Worker role, existence, and active account status validation.
--                 - Worker phone number presence validation.
--                 - Audit logging to public.worker_contact_logs.
--              2. Keeps public.worker_contact_logs under Row Level Security with direct
--                 client access restricted (no client SELECT/INSERT/UPDATE/DELETE policies).
--                 All phone retrieval is performed exclusively through the secure RPC.
--              3. Safe & non-destructive: zero tables or columns dropped or recreated.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.profiles table does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'workers'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.workers table does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'jobs'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.jobs table does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'job_records'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.job_records table does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'worker_contact_logs'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.worker_contact_logs table does not exist.';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CONTACT LOGS ACCESS RESTRICTION & RLS ENFORCEMENT
--    Row Level Security is enabled on public.worker_contact_logs.
--    Direct client access is strictly restricted (no public/authenticated policies).
--    Audit records are inserted exclusively by the SECURITY DEFINER function below.
-- ------------------------------------------------------------------------------
ALTER TABLE public.worker_contact_logs ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy select policies if present to keep direct client access restricted
DROP POLICY IF EXISTS "worker_contact_logs_select" ON public.worker_contact_logs;
DROP POLICY IF EXISTS "contact_logs_caller_and_admin_policy" ON public.worker_contact_logs;

-- Explicitly revoke direct client access from PUBLIC, anon, and authenticated
REVOKE ALL ON public.worker_contact_logs FROM PUBLIC, anon, authenticated;

-- Ensure rate limits table exists for atomic rate limiting
CREATE TABLE IF NOT EXISTS public.worker_contact_rate_limits (
    caller_id uuid PRIMARY KEY,
    window_start timestamptz NOT NULL DEFAULT now(),
    request_count integer NOT NULL DEFAULT 1
);
ALTER TABLE public.worker_contact_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_contact_rate_limits FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. SECURE WORKER CONTACT RPC (OPTION 3 AUTHORIZATION + STRICT VALIDATION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_worker_contact_phone(
    p_worker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_caller_status text;
    v_current_count integer;
    v_phone text;
    v_max_daily_limit constant integer := 15;
    v_is_self_or_managed boolean := false;
    v_is_admin boolean := false;
    v_has_job_connection boolean := false;
BEGIN
    -- 1. Authentication Check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to contact workers.' USING ERRCODE = '42501';
    END IF;

    -- 2. Explicit Target Worker ID Parameter Validation (SQLSTATE 22004)
    IF p_worker_id IS NULL THEN
        RAISE EXCEPTION 'Worker ID must not be null.' USING ERRCODE = '22004';
    END IF;

    -- 3. Explicit Caller Profile Existence & Account Status Validation
    SELECT role::text, account_status::text
    INTO v_caller_role, v_caller_status
    FROM public.profiles
    WHERE id = v_caller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile does not exist.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_status IS NOT NULL AND v_caller_status <> 'active' THEN
        RAISE EXCEPTION 'Your account is suspended or deactivated.' USING ERRCODE = '42501';
    END IF;

    -- 4. Identify Caller Privileges
    -- Check if caller is self or managing this assisted worker profile
    v_is_self_or_managed := (v_caller_id = p_worker_id) OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_worker_id
          AND is_assisted_profile = true
          AND created_by = v_caller_id
    );

    -- Check if caller is a platform administrator
    v_is_admin := public.is_admin(v_caller_id);

    -- 5. Explicit Employer Role & Existing job_records Authorization Check
    IF NOT v_is_self_or_managed AND NOT v_is_admin THEN
        -- Explicit Employer Role Validation
        IF v_caller_role <> 'employer' THEN
            RAISE EXCEPTION 'Only authorized employers, admins, or the worker can access this contact.' USING ERRCODE = '42501';
        END IF;

        -- Existing job_records relationship check:
        -- Caller must have a job in public.jobs with a matching record in public.job_records for this worker
        v_has_job_connection := EXISTS (
            SELECT 1
            FROM public.jobs j
            JOIN public.job_records jr ON jr.job_id = j.id
            WHERE j.employer_id = v_caller_id
              AND jr.worker_id = p_worker_id
        );

        IF NOT v_has_job_connection THEN
            RAISE EXCEPTION 'You need an existing job connection with this worker to access their contact number.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 6. Daily Rate Limiting (15 calls per 24 hours) for Employer Callers
    IF NOT v_is_self_or_managed AND NOT v_is_admin THEN
        INSERT INTO public.worker_contact_rate_limits (caller_id, window_start, request_count)
        VALUES (v_caller_id, now(), 1)
        ON CONFLICT (caller_id) DO UPDATE
        SET request_count = CASE
                WHEN public.worker_contact_rate_limits.window_start < (now() - interval '24 hours') THEN 1
                ELSE public.worker_contact_rate_limits.request_count + 1
            END,
            window_start = CASE
                WHEN public.worker_contact_rate_limits.window_start < (now() - interval '24 hours') THEN now()
                ELSE public.worker_contact_rate_limits.window_start
            END
        RETURNING request_count INTO v_current_count;

        IF v_current_count > v_max_daily_limit THEN
            RAISE EXCEPTION 'Daily contact limit reached (15 calls per 24 hours). Please try again tomorrow.' USING ERRCODE = 'P0001';
        END IF;
    ELSE
        v_current_count := 0;
    END IF;

    -- 7. Worker Role and Account Status Validation
    SELECT p.phone_number
    INTO v_phone
    FROM public.profiles p
    JOIN public.workers w ON w.id = p.id
    WHERE p.id = p_worker_id
      AND p.role::text = 'worker'
      AND (p.account_status IS NULL OR p.account_status = 'active');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Worker profile does not exist or is not an active worker.' USING ERRCODE = 'P0002';
    END IF;

    IF v_phone IS NULL OR trim(v_phone) = '' THEN
        RAISE EXCEPTION 'Worker contact number not available.' USING ERRCODE = 'P0002';
    END IF;

    -- 8. Audit the Authorized Contact Retrieval
    INSERT INTO public.worker_contact_logs (caller_id, worker_id, contact_phone, created_at)
    VALUES (v_caller_id, p_worker_id, v_phone, now());

    RETURN jsonb_build_object(
        'phone_number', v_phone,
        'remaining_calls', CASE
            WHEN v_is_self_or_managed OR v_is_admin THEN 999
            ELSE GREATEST(0, v_max_daily_limit - v_current_count)
        END
    );
END;
$$;

COMMENT ON FUNCTION public.get_worker_contact_phone(uuid) IS
  'Secure Option 3 worker contact phone retrieval RPC. Enforces search_path, explicit parameter null check, explicit caller profile validation, employer role check, existing job_records connection, worker active status, 15 calls/day rate limit, and audit logging.';

REVOKE ALL ON FUNCTION public.get_worker_contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_contact_phone(uuid) TO authenticated;

COMMIT;
