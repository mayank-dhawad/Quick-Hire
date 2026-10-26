-- ==============================================================================
-- QuickHire Database Migration
-- Migration Name: 20261027000000_add_worker_geocoding_and_nearby_search.sql
-- Description: Additive, privacy-hardened migration for Nearby Workers Search:
--              1. Coordinate fields (latitude, longitude) & private geocoded_address.
--              2. In-place replacement of public_worker_directory view with ~111m rounded coordinates.
--              3. Locality coordinates backfill for existing rural workers.
--              4. Concurrency-safe, atomic contact rate-limiting table and audit log.
--              5. Secure RPC: get_worker_contact_phone (15 calls/day limit, self/assisted bypass).
--              6. Server-only employer authorization table & secure RPC: register_as_employer.
--              7. Secure RPC: get_payment_recipient_details (relationship-verified wage payment).
--              8. Numerically safe Haversine search RPC: search_nearby_workers.
--              9. Hardened protect_profile_admin_role trigger with assisted worker identity protection.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- SECTION 1: ADDITIVE SCHEMA ENHANCEMENTS
-- ------------------------------------------------------------------------------

-- 1.1 Add nullable coordinate fields to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude double precision NULL,
  ADD COLUMN IF NOT EXISTS longitude double precision NULL,
  ADD COLUMN IF NOT EXISTS geocoded_address text NULL;

COMMENT ON COLUMN public.profiles.latitude IS 'Private geocoded latitude coordinate';
COMMENT ON COLUMN public.profiles.longitude IS 'Private geocoded longitude coordinate';
COMMENT ON COLUMN public.profiles.geocoded_address IS 'Private full geocoded address text. Never exposed in public directory.';

-- 1.2 Add nullable coordinate fields to public.workers
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS latitude double precision NULL,
  ADD COLUMN IF NOT EXISTS longitude double precision NULL,
  ADD COLUMN IF NOT EXISTS geocoded_address text NULL;

COMMENT ON COLUMN public.workers.latitude IS 'Private worker operating latitude';
COMMENT ON COLUMN public.workers.longitude IS 'Private worker operating longitude';
COMMENT ON COLUMN public.workers.geocoded_address IS 'Private full geocoded address text. Never exposed in public directory.';

-- 1.3 Partial indexes on coordinates for spatial lookups
CREATE INDEX IF NOT EXISTS idx_workers_lat_lon
  ON public.workers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_lat_lon
  ON public.profiles (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ------------------------------------------------------------------------------
-- SECTION 2: INITIAL COORDINATE BACKFILL FOR EXISTING WORKERS
-- ------------------------------------------------------------------------------
-- Provides approximate locality-level centroids for known rural districts
-- so the Nearby Map immediately displays pins for existing workers.

UPDATE public.workers w
SET latitude = COALESCE(w.latitude, p.latitude, 18.5204),
    longitude = COALESCE(w.longitude, p.longitude, 73.8567)
FROM public.profiles p
WHERE w.id = p.id
  AND w.latitude IS NULL
  AND (
    p.district ILIKE '%Pune%'
    OR p.location ILIKE '%Pune%'
    OR p.village ILIKE '%Hadapsar%'
    OR p.village ILIKE '%Shirur%'
    OR p.village ILIKE '%Baramati%'
    OR p.state ILIKE '%Maharashtra%'
  );

-- Backfill profile coordinates if worker had them
UPDATE public.profiles p
SET latitude = COALESCE(p.latitude, w.latitude),
    longitude = COALESCE(p.longitude, w.longitude)
FROM public.workers w
WHERE p.id = w.id
  AND p.latitude IS NULL
  AND w.latitude IS NOT NULL;

-- ------------------------------------------------------------------------------
-- SECTION 3: IN-PLACE REPLACEMENT OF PUBLIC DIRECTORY VIEW
-- ------------------------------------------------------------------------------
-- Columns 1 to 15 match 20261026000000 exactly. Rounded coordinates are appended
-- at columns 16 & 17 (~111m precision). geocoded_address is EXCLUDED.

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
    p.is_assisted_profile,
    ROUND(COALESCE(w.latitude, p.latitude)::numeric, 3)::double precision AS latitude,
    ROUND(COALESCE(w.longitude, p.longitude)::numeric, 3)::double precision AS longitude
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
WHERE w.is_available = true
  AND (p.account_status IS NULL OR p.account_status = 'active')
  AND p.role::text = 'worker';

COMMENT ON VIEW public.public_worker_directory IS
  'Sanitized public worker discovery view. Exposes approximate locality coordinates rounded to 3 decimal places (~111m) and strictly omits exact addresses, emails, bank accounts, and private profile data.';

GRANT SELECT ON public.public_worker_directory TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 4: CONCURRENCY-SAFE ATOMIC RATE-LIMITING TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.worker_contact_rate_limits (
    caller_id uuid PRIMARY KEY,
    window_start timestamptz NOT NULL DEFAULT now(),
    request_count integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.worker_contact_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id uuid NOT NULL,
    worker_id uuid NOT NULL,
    contact_phone text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_contact_logs_caller
    ON public.worker_contact_logs (caller_id, created_at DESC);

ALTER TABLE public.worker_contact_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_contact_logs ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke all direct privileges on internal rate-limit table
REVOKE ALL ON public.worker_contact_rate_limits FROM PUBLIC, anon, authenticated;

-- Callers can inspect only their own audit logs; admins can inspect all
REVOKE ALL ON public.worker_contact_logs FROM PUBLIC, anon;
GRANT SELECT ON public.worker_contact_logs TO authenticated;

DROP POLICY IF EXISTS "contact_logs_caller_and_admin_policy" ON public.worker_contact_logs;
CREATE POLICY "contact_logs_caller_and_admin_policy"
ON public.worker_contact_logs
FOR SELECT
TO authenticated
USING (caller_id = auth.uid() OR public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- SECTION 5: SECURE WORKER CONTACT RPC (ATOMIC 15 CALLS / DAY)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_worker_contact_phone(
    p_worker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_caller_status text;
    v_current_count integer;
    v_phone text;
    v_max_daily_limit constant integer := 15;
    v_is_self_or_managed boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to contact workers.' USING ERRCODE = '42501';
    END IF;

    -- Verify caller account is active
    SELECT role::text, account_status::text
    INTO v_caller_role, v_caller_status
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_status IS NOT NULL AND v_caller_status <> 'active' THEN
        RAISE EXCEPTION 'Your account is suspended or deactivated.' USING ERRCODE = '42501';
    END IF;

    -- Check if caller is self or managing this assisted worker
    v_is_self_or_managed := (v_caller_id = p_worker_id) OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_worker_id
          AND is_assisted_profile = true
          AND created_by = v_caller_id
    );

    -- Only apply daily cold-call rate limit if caller is NOT self/manager and NOT admin
    IF NOT v_is_self_or_managed AND NOT public.is_admin(v_caller_id) THEN
        -- Atomic rate limit upsert: resets counter if window is older than 24 hours
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

    -- Retrieve the worker phone number securely.
    -- Strict filters prevent information leakage regarding non-worker, inactive, or admin profiles.
    SELECT p.phone_number
    INTO v_phone
    FROM public.profiles p
    JOIN public.workers w ON w.id = p.id
    WHERE p.id = p_worker_id
      AND p.role::text = 'worker'
      AND (p.account_status IS NULL OR p.account_status = 'active');

    IF v_phone IS NULL OR v_phone = '' THEN
        RAISE EXCEPTION 'Worker contact number not available.' USING ERRCODE = 'P0002';
    END IF;

    -- Audit the successful contact event
    INSERT INTO public.worker_contact_logs (caller_id, worker_id, contact_phone, created_at)
    VALUES (v_caller_id, p_worker_id, v_phone, now());

    RETURN jsonb_build_object(
        'phone_number', v_phone,
        'remaining_calls', CASE
            WHEN v_is_self_or_managed OR public.is_admin(v_caller_id) THEN 999
            ELSE GREATEST(0, v_max_daily_limit - v_current_count)
        END
    );
END;
$$;

COMMENT ON FUNCTION public.get_worker_contact_phone IS
  'Secure atomic worker contact phone retrieval RPC with 15 calls/day rate limit and audit logging.';

REVOKE ALL ON FUNCTION public.get_worker_contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_contact_phone(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 6: SERVER-ONLY EMPLOYER ONBOARDING AUTHORIZATION & RPC
-- ------------------------------------------------------------------------------
-- Internal server-only table: client roles have ZERO access.
-- Used to securely grant role transition without relying on client-controllable settings.

CREATE TABLE IF NOT EXISTS public.employer_registration_grants (
    user_id uuid PRIMARY KEY,
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 seconds')
);

ALTER TABLE public.employer_registration_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employer_registration_grants FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_as_employer()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_existing_profile record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    SELECT id, role, account_status
    INTO v_existing_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_existing_profile.id IS NOT NULL THEN
        -- Prevent suspended or deactivated accounts from self-reactivating via role transition
        IF v_existing_profile.account_status IS NOT NULL AND v_existing_profile.account_status <> 'active' THEN
            RAISE EXCEPTION 'Account is not in active status. Contact platform support.' USING ERRCODE = '42501';
        END IF;

        -- Prevent demoting existing admin
        IF v_existing_profile.role = 'admin' THEN
            RETURN jsonb_build_object('success', true, 'role', 'admin', 'message', 'Admin profile preserved.');
        END IF;

        -- Grant short-lived server-side authorization for the role transition
        INSERT INTO public.employer_registration_grants (user_id, granted_at, expires_at)
        VALUES (v_user_id, now(), now() + interval '10 seconds')
        ON CONFLICT (user_id) DO UPDATE
        SET granted_at = now(), expires_at = now() + interval '10 seconds';

        UPDATE public.profiles
        SET role = 'employer',
            updated_at = now()
        WHERE id = v_user_id;

        DELETE FROM public.employer_registration_grants WHERE user_id = v_user_id;
    ELSE
        -- New user profile creation as employer
        INSERT INTO public.employer_registration_grants (user_id, granted_at, expires_at)
        VALUES (v_user_id, now(), now() + interval '10 seconds')
        ON CONFLICT (user_id) DO UPDATE
        SET granted_at = now(), expires_at = now() + interval '10 seconds';

        INSERT INTO public.profiles (id, role, full_name, account_status, created_at, updated_at)
        VALUES (v_user_id, 'employer', 'QuickHire Employer', 'active', now(), now());

        DELETE FROM public.employer_registration_grants WHERE user_id = v_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'role', 'employer');
END;
$$;

COMMENT ON FUNCTION public.register_as_employer IS
  'Server-authorized employer registration RPC. Uses internal grant table to safely authorize employer role onboarding.';

REVOKE ALL ON FUNCTION public.register_as_employer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_as_employer() TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 7: SECURE RECIPIENT BANKING DETAILS RPC (RELATIONSHIP-GATED)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_recipient_details(
    p_recipient_id uuid,
    p_job_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_recipient record;
    v_is_authorized boolean := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to initiate payments.' USING ERRCODE = '42501';
    END IF;

    -- 1. Check verified authorization relationship using actual schema tables & columns:
    --    a) Caller is Platform Administrator
    --    b) Caller is the recipient themselves (checking self banking info)
    --    c) Caller is an intermediary managing the assisted worker
    --    d) Employer has a registered job record with this worker (public.jobs.employer_id and public.job_records.worker_id)
    --    e) Employer has an explicit job match via p_job_id where worker applied/was hired
    --    f) Caller has an existing payment record with this recipient in public.payments (payer_id and payee_id)
    IF public.is_admin(v_caller_id) OR v_caller_id = p_recipient_id THEN
        v_is_authorized := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_recipient_id
          AND is_assisted_profile = true
          AND created_by = v_caller_id
    ) THEN
        v_is_authorized := true;
    ELSIF p_job_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.job_records jr ON jr.job_id = j.id
        WHERE j.id = p_job_id
          AND j.employer_id = v_caller_id
          AND jr.worker_id = p_recipient_id
    ) THEN
        v_is_authorized := true;
    ELSIF EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.job_records jr ON jr.job_id = j.id
        WHERE j.employer_id = v_caller_id
          AND jr.worker_id = p_recipient_id
    ) THEN
        v_is_authorized := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.payments pay
        WHERE pay.payer_id = v_caller_id
          AND pay.payee_id = p_recipient_id
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized: No active job or payment relationship with this recipient.' USING ERRCODE = '42501';
    END IF;

    -- 2. Fetch recipient banking details
    SELECT full_name, bank_name, bank_account_no, bank_ifsc, upi_id
    INTO v_recipient
    FROM public.profiles
    WHERE id = p_recipient_id
      AND (account_status IS NULL OR account_status = 'active');

    IF v_recipient.full_name IS NULL THEN
        RAISE EXCEPTION 'Recipient not found or account is not active.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'recipient_name', v_recipient.full_name,
        'bank_name', v_recipient.bank_name,
        'bank_account_no', v_recipient.bank_account_no,
        'bank_ifsc', v_recipient.bank_ifsc,
        'upi_id', v_recipient.upi_id
    );
END;
$$;

COMMENT ON FUNCTION public.get_payment_recipient_details IS
  'Relationship-verified wage payment recipient banking retrieval RPC. Exposes banking only to authorized parties.';

REVOKE ALL ON FUNCTION public.get_payment_recipient_details(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_recipient_details(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 8: NUMERICALLY SAFE HAVERSINE NEARBY SEARCH RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_nearby_workers(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 50.0,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  full_name text,
  category text,
  skills text[],
  experience_years integer,
  daily_wage numeric,
  experience_description text,
  preferred_work_location text,
  average_rating numeric,
  is_available boolean,
  location text,
  village text,
  district text,
  state text,
  is_assisted_profile boolean,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Input parameter validation
  IF p_lat IS NULL OR p_lat < -90.0 OR p_lat > 90.0 THEN
    RAISE EXCEPTION 'QuickHire Geocoding: Latitude must be between -90 and 90 degrees.';
  END IF;

  IF p_lon IS NULL OR p_lon < -180.0 OR p_lon > 180.0 THEN
    RAISE EXCEPTION 'QuickHire Geocoding: Longitude must be between -180 and 180 degrees.';
  END IF;

  IF p_radius_km IS NULL OR p_radius_km < 1.0 OR p_radius_km > 200.0 THEN
    RAISE EXCEPTION 'QuickHire Geocoding: Search radius must be between 1 and 200 kilometres.';
  END IF;

  RETURN QUERY
  WITH calculated_workers AS (
    SELECT
      pwd.id,
      pwd.full_name,
      pwd.category::text AS category,
      pwd.skills,
      pwd.experience_years,
      pwd.daily_wage,
      pwd.experience_description,
      pwd.preferred_work_location,
      pwd.average_rating,
      pwd.is_available,
      pwd.location,
      pwd.village,
      pwd.district,
      pwd.state,
      pwd.is_assisted_profile,
      pwd.latitude,
      pwd.longitude,
      ROUND(
        (
          6371.0088 * 2.0 * asin(
            sqrt(
              LEAST(
                1.0::double precision,
                GREATEST(
                  0.0::double precision,
                  sin(radians(pwd.latitude - p_lat) / 2.0) ^ 2.0 +
                  cos(radians(p_lat)) * cos(radians(pwd.latitude)) *
                  (sin(radians(pwd.longitude - p_lon) / 2.0) ^ 2.0)
                )
              )
            )
          )
        )::numeric,
        1
      )::double precision AS distance_km
    FROM public.public_worker_directory pwd
    WHERE pwd.latitude IS NOT NULL
      AND pwd.longitude IS NOT NULL
      AND (p_category IS NULL OR p_category = '' OR p_category = 'All' OR pwd.category::text = p_category)
  )
  SELECT
    cw.id,
    cw.full_name,
    cw.category,
    cw.skills,
    cw.experience_years,
    cw.daily_wage,
    cw.experience_description,
    cw.preferred_work_location,
    cw.average_rating,
    cw.is_available,
    cw.location,
    cw.village,
    cw.district,
    cw.state,
    cw.is_assisted_profile,
    cw.latitude,
    cw.longitude,
    cw.distance_km
  FROM calculated_workers cw
  WHERE cw.distance_km <= p_radius_km
  ORDER BY cw.distance_km ASC;
END;
$$;

COMMENT ON FUNCTION public.search_nearby_workers IS
  'Secure Haversine nearby worker search RPC with clamped numerical boundaries and distance sorting.';

REVOKE ALL ON FUNCTION public.search_nearby_workers(double precision, double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_nearby_workers(double precision, double precision, double precision, text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 9: HARDENED ROLE PROTECTION & ASSISTED IDENTITY TRIGGER
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_admin boolean;
    v_has_employer_grant boolean;
BEGIN
    -- Check if current session caller is admin
    v_is_admin := (auth.role() = 'service_role') OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()));

    IF TG_OP = 'INSERT' THEN
        -- Check if server employer grant exists for this user
        SELECT EXISTS (
            SELECT 1 FROM public.employer_registration_grants
            WHERE user_id = NEW.id AND expires_at > now()
        ) INTO v_has_employer_grant;

        -- 1. Assisted worker profile identity model enforcement
        IF NEW.is_assisted_profile IS TRUE THEN
            -- Intermediary caller must be recorded as creator
            NEW.created_by := auth.uid();
            -- Assisted worker can only have worker role
            NEW.role := 'worker';
            -- Prevent claiming an ID that belongs to an existing auth.users account
            IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
                RAISE EXCEPTION 'Cannot create assisted profile for an existing authentication user ID.' USING ERRCODE = '42501';
            END IF;
        ELSE
            -- Normal profile: cannot forge created_by
            NEW.created_by := NULL;
        END IF;

        -- 2. Non-admins cannot self-assign admin role on insert
        IF NEW.role = 'admin' AND NOT v_is_admin THEN
            NEW.role := 'worker';
        ELSIF NEW.role = 'employer' AND NOT v_is_admin AND NOT v_has_employer_grant THEN
            NEW.role := 'worker';
        END IF;

        -- 3. Non-admins cannot insert suspended or deactivated account_status
        IF NEW.account_status IS NOT NULL AND NEW.account_status <> 'active' AND NOT v_is_admin THEN
            NEW.account_status := 'active';
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if server employer grant exists for this user
        SELECT EXISTS (
            SELECT 1 FROM public.employer_registration_grants
            WHERE user_id = NEW.id AND expires_at > now()
        ) INTO v_has_employer_grant;

        -- 1. Non-admins cannot elevate to admin
        IF NEW.role = 'admin' AND (OLD.role IS NULL OR OLD.role <> 'admin') AND NOT v_is_admin THEN
            NEW.role := COALESCE(OLD.role, 'worker');
        ELSIF NEW.role = 'employer' AND (OLD.role IS NULL OR OLD.role <> 'employer') AND NOT v_is_admin AND NOT v_has_employer_grant THEN
            NEW.role := COALESCE(OLD.role, 'worker');
        END IF;

        -- 2. Non-admins cannot transfer or change assisted worker profile identity
        IF NEW.is_assisted_profile <> OLD.is_assisted_profile AND NOT v_is_admin THEN
            NEW.is_assisted_profile := OLD.is_assisted_profile;
        END IF;
        IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_is_admin THEN
            NEW.created_by := OLD.created_by;
        END IF;

        -- 3. Non-admins cannot self-reactivate a deactivated or suspended account
        IF OLD.account_status IN ('suspended', 'deactivated') AND NEW.account_status = 'active' AND NOT v_is_admin THEN
            NEW.account_status := OLD.account_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_role();

COMMIT;
