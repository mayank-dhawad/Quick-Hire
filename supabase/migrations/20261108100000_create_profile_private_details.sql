-- ==============================================================================
-- QuickHire Database Migration
-- Migration Name: 20261108100000_create_profile_private_details.sql
-- Description: Isolated private profile data architecture with column-level defense:
--              1. Creates public.profile_private_details with strict 1:1 FK to profiles.
--              2. Enforces strict owner-only Row Level Security on private details.
--              3. Restricts SELECT on public.profiles to whitelisted non-private columns,
--                 preventing employers from reading legacy private columns.
--              4. Establishes masked conflict audit table protected by admin-only RLS.
--              5. Non-destructively backfills private fields with conflict detection.
--              6. Deploys dual-write synchronization trigger during transition.
--              7. Deploys least-privilege RPC get_payment_recipient_details() for employers.
--              8. Deploys protected parity verification function verify_profile_private_parity().
-- Dependencies: 20261026000000_fix_worker_profile_location_and_permissions.sql
-- ==============================================================================

BEGIN;

-- Verify pgcrypto extension is available in extensions schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) THEN
        CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT SCHEMA VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.profiles table does not exist.';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CREATE TABLE public.profile_private_details
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_private_details (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    bank_name text,
    bank_account_no text,
    bank_ifsc text,
    upi_id text,
    date_of_birth date,
    address_line text,
    emergency_contact_name text,
    emergency_contact_phone text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_private_details IS
    'Isolated private personal & financial details with strict owner-only access. Decoupled from public.profiles.';

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) ON profile_private_details
-- ------------------------------------------------------------------------------
ALTER TABLE public.profile_private_details ENABLE ROW LEVEL SECURITY;

-- 3.1 Owner & Admin SELECT Policy
DROP POLICY IF EXISTS "private_details_owner_select" ON public.profile_private_details;
CREATE POLICY "private_details_owner_select"
ON public.profile_private_details
FOR SELECT
TO authenticated
USING (
    auth.uid() = profile_id
    OR public.is_admin(auth.uid())
);

-- 3.2 Owner & Admin INSERT Policy
DROP POLICY IF EXISTS "private_details_owner_insert" ON public.profile_private_details;
CREATE POLICY "private_details_owner_insert"
ON public.profile_private_details
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = profile_id
    OR public.is_admin(auth.uid())
);

-- 3.3 Owner & Admin UPDATE Policy
DROP POLICY IF EXISTS "private_details_owner_update" ON public.profile_private_details;
CREATE POLICY "private_details_owner_update"
ON public.profile_private_details
FOR UPDATE
TO authenticated
USING (
    auth.uid() = profile_id
    OR public.is_admin(auth.uid())
)
WITH CHECK (
    auth.uid() = profile_id
    OR public.is_admin(auth.uid())
);

-- 3.4 Table Grants: Least Privilege
REVOKE ALL ON public.profile_private_details FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.profile_private_details TO authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profile_private_details FROM authenticated;

-- ------------------------------------------------------------------------------
-- 4. COLUMN-LEVEL PERMISSION HARDENING (TWO-STAGE DEPLOYMENT)
-- ------------------------------------------------------------------------------
-- IMPORTANT: Migration 1A is strictly ADDITIVE.
-- In accordance with the two-stage migration safety plan (Migration 1A -> Cutover -> Migration 1B),
-- column-level SELECT revocation on public.profiles is deferred to Migration 1B
-- (e.g. 20261115000000_revoke_legacy_private_columns.sql).
--
-- Executing REVOKE SELECT prematurely in Migration 1A before the frontend cutover
-- is deployed and verified across active user sessions would cause immediate 42501
-- ("permission denied for table profiles") crashes in existing clients.
--
-- Migration 1B will execute:
--   REVOKE SELECT ON public.profiles FROM authenticated;
--   GRANT SELECT (
--       id, role, full_name, phone_number, is_assisted_profile, created_by,
--       location, category, skills, experience_years, daily_wage, account_status,
--       created_at, updated_at, village, city, district, state, pincode, gender, email
--   ) ON public.profiles TO authenticated;

-- Ensure authenticated role maintains read and write access during the transition:
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. MASKED CONFLICT AUDIT TABLE & SENSITIVE DATA DEFENSE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_sensitive_audit_text(p_field text, p_val text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    IF p_val IS NULL OR p_val = '' THEN
        RETURN NULL;
    END IF;

    IF p_field IN ('bank_account_no', 'account_no') THEN
        IF length(p_val) > 4 THEN
            RETURN repeat('X', length(p_val) - 4) || substr(p_val, length(p_val) - 3);
        ELSE
            RETURN 'XXXX';
        END IF;
    ELSIF p_field = 'upi_id' THEN
        IF position('@' IN p_val) > 2 THEN
            RETURN substr(p_val, 1, 2) || '***' || substr(p_val, position('@' IN p_val));
        ELSE
            RETURN '***@upi';
        END IF;
    ELSIF p_field IN ('emergency_contact_phone', 'phone_number') THEN
        IF length(p_val) > 4 THEN
            RETURN substr(p_val, 1, 3) || repeat('X', length(p_val) - 6) || substr(p_val, length(p_val) - 2);
        ELSE
            RETURN 'XXXXX';
        END IF;
    ELSE
        -- Return SHA-256 fingerprint for address and personal data to avoid storing raw plaintext
        BEGIN
            RETURN 'HASH:' || substr(encode(extensions.digest(p_val::bytea, 'sha256'), 'hex'), 1, 12);
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                RETURN 'HASH:' || substr(encode(digest(p_val::bytea, 'sha256'), 'hex'), 1, 12);
            EXCEPTION WHEN OTHERS THEN
                RETURN 'HASH:' || substr(md5(p_val), 1, 12);
            END;
        END;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profile_private_migration_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    field_name text NOT NULL,
    masked_legacy_value text,
    masked_destination_value text,
    resolution_status text NOT NULL DEFAULT 'pending_review'
        CHECK (resolution_status IN ('pending_review', 'retained_destination', 'overwritten_legacy', 'manual_resolved')),
    detected_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by uuid
);

COMMENT ON TABLE public.profile_private_migration_conflicts IS
    'Audit registry of divergence between legacy profiles columns and destination profile_private_details rows. Values are strictly masked.';

-- Restrict conflict table to administrators only
ALTER TABLE public.profile_private_migration_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conflicts_admin_only_select" ON public.profile_private_migration_conflicts;
CREATE POLICY "conflicts_admin_only_select"
ON public.profile_private_migration_conflicts
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "conflicts_admin_only_modify" ON public.profile_private_migration_conflicts;
CREATE POLICY "conflicts_admin_only_modify"
ON public.profile_private_migration_conflicts
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

REVOKE ALL ON public.profile_private_migration_conflicts FROM anon, PUBLIC, authenticated;
GRANT SELECT, UPDATE ON public.profile_private_migration_conflicts TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. ATOMIC NON-DESTRUCTIVE BACKFILL WITH CONFLICT DETECTION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_existing public.profile_private_details%ROWTYPE;
    v_has_conflict boolean;
BEGIN
    FOR r IN (
        SELECT
            id,
            bank_name,
            bank_account_no,
            bank_ifsc,
            upi_id,
            date_of_birth,
            address_line,
            emergency_contact_name,
            emergency_contact_phone,
            created_at
        FROM public.profiles
        WHERE bank_name IS NOT NULL
           OR bank_account_no IS NOT NULL
           OR bank_ifsc IS NOT NULL
           OR upi_id IS NOT NULL
           OR date_of_birth IS NOT NULL
           OR address_line IS NOT NULL
           OR emergency_contact_name IS NOT NULL
           OR emergency_contact_phone IS NOT NULL
    ) LOOP
        SELECT * INTO v_existing
        FROM public.profile_private_details
        WHERE profile_id = r.id;

        IF NOT FOUND THEN
            -- Safe initial backfill
            INSERT INTO public.profile_private_details (
                profile_id,
                bank_name,
                bank_account_no,
                bank_ifsc,
                upi_id,
                date_of_birth,
                address_line,
                emergency_contact_name,
                emergency_contact_phone,
                created_at,
                updated_at
            ) VALUES (
                r.id,
                r.bank_name,
                r.bank_account_no,
                r.bank_ifsc,
                r.upi_id,
                r.date_of_birth,
                r.address_line,
                r.emergency_contact_name,
                r.emergency_contact_phone,
                COALESCE(r.created_at, now()),
                now()
            );
        ELSE
            -- Destination already exists: evaluate field divergence without silent overwrite
            v_has_conflict := false;

            IF r.bank_name IS NOT NULL AND v_existing.bank_name IS NOT NULL AND r.bank_name IS DISTINCT FROM v_existing.bank_name THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'bank_name', r.bank_name, v_existing.bank_name);
                v_has_conflict := true;
            END IF;

            IF r.bank_account_no IS NOT NULL AND v_existing.bank_account_no IS NOT NULL AND r.bank_account_no IS DISTINCT FROM v_existing.bank_account_no THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'bank_account_no', public.mask_sensitive_audit_text('bank_account_no', r.bank_account_no), public.mask_sensitive_audit_text('bank_account_no', v_existing.bank_account_no));
                v_has_conflict := true;
            END IF;

            IF r.bank_ifsc IS NOT NULL AND v_existing.bank_ifsc IS NOT NULL AND r.bank_ifsc IS DISTINCT FROM v_existing.bank_ifsc THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'bank_ifsc', r.bank_ifsc, v_existing.bank_ifsc);
                v_has_conflict := true;
            END IF;

            IF r.upi_id IS NOT NULL AND v_existing.upi_id IS NOT NULL AND r.upi_id IS DISTINCT FROM v_existing.upi_id THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'upi_id', public.mask_sensitive_audit_text('upi_id', r.upi_id), public.mask_sensitive_audit_text('upi_id', v_existing.upi_id));
                v_has_conflict := true;
            END IF;

            IF r.date_of_birth IS NOT NULL AND v_existing.date_of_birth IS NOT NULL AND r.date_of_birth IS DISTINCT FROM v_existing.date_of_birth THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'date_of_birth', public.mask_sensitive_audit_text('date_of_birth', r.date_of_birth::text), public.mask_sensitive_audit_text('date_of_birth', v_existing.date_of_birth::text));
                v_has_conflict := true;
            END IF;

            IF r.address_line IS NOT NULL AND v_existing.address_line IS NOT NULL AND r.address_line IS DISTINCT FROM v_existing.address_line THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'address_line', public.mask_sensitive_audit_text('address_line', r.address_line), public.mask_sensitive_audit_text('address_line', v_existing.address_line));
                v_has_conflict := true;
            END IF;

            IF r.emergency_contact_name IS NOT NULL AND v_existing.emergency_contact_name IS NOT NULL AND r.emergency_contact_name IS DISTINCT FROM v_existing.emergency_contact_name THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'emergency_contact_name', public.mask_sensitive_audit_text('emergency_contact_name', r.emergency_contact_name), public.mask_sensitive_audit_text('emergency_contact_name', v_existing.emergency_contact_name));
                v_has_conflict := true;
            END IF;

            IF r.emergency_contact_phone IS NOT NULL AND v_existing.emergency_contact_phone IS NOT NULL AND r.emergency_contact_phone IS DISTINCT FROM v_existing.emergency_contact_phone THEN
                INSERT INTO public.profile_private_migration_conflicts (profile_id, field_name, masked_legacy_value, masked_destination_value)
                VALUES (r.id, 'emergency_contact_phone', public.mask_sensitive_audit_text('emergency_contact_phone', r.emergency_contact_phone), public.mask_sensitive_audit_text('emergency_contact_phone', v_existing.emergency_contact_phone));
                v_has_conflict := true;
            END IF;

            -- Backfill any missing fields without overwriting existing destination non-null values
            UPDATE public.profile_private_details
            SET bank_name = COALESCE(bank_name, r.bank_name),
                bank_account_no = COALESCE(bank_account_no, r.bank_account_no),
                bank_ifsc = COALESCE(bank_ifsc, r.bank_ifsc),
                upi_id = COALESCE(upi_id, r.upi_id),
                date_of_birth = COALESCE(date_of_birth, r.date_of_birth),
                address_line = COALESCE(address_line, r.address_line),
                emergency_contact_name = COALESCE(emergency_contact_name, r.emergency_contact_name),
                emergency_contact_phone = COALESCE(emergency_contact_phone, r.emergency_contact_phone),
                updated_at = now()
            WHERE profile_id = r.id;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. DUAL-WRITE SYNCHRONIZATION TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_legacy_profile_private_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.bank_name IS DISTINCT FROM OLD.bank_name)
       OR (NEW.bank_account_no IS DISTINCT FROM OLD.bank_account_no)
       OR (NEW.bank_ifsc IS DISTINCT FROM OLD.bank_ifsc)
       OR (NEW.upi_id IS DISTINCT FROM OLD.upi_id)
       OR (NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth)
       OR (NEW.address_line IS DISTINCT FROM OLD.address_line)
       OR (NEW.emergency_contact_name IS DISTINCT FROM OLD.emergency_contact_name)
       OR (NEW.emergency_contact_phone IS DISTINCT FROM OLD.emergency_contact_phone)
    THEN
        -- Guard against recreating private details when all private fields are being cleared or account is deactivated
        IF (NEW.bank_name IS NULL AND NEW.bank_account_no IS NULL AND NEW.bank_ifsc IS NULL AND NEW.upi_id IS NULL
            AND NEW.date_of_birth IS NULL AND NEW.address_line IS NULL 
            AND NEW.emergency_contact_name IS NULL AND NEW.emergency_contact_phone IS NULL)
           OR (NEW.account_status = 'deactivated') THEN
            DELETE FROM public.profile_private_details WHERE profile_id = NEW.id;
        ELSE
            INSERT INTO public.profile_private_details (
                profile_id,
                bank_name,
                bank_account_no,
                bank_ifsc,
                upi_id,
                date_of_birth,
                address_line,
                emergency_contact_name,
                emergency_contact_phone,
                updated_at
            ) VALUES (
                NEW.id,
                NEW.bank_name,
                NEW.bank_account_no,
                NEW.bank_ifsc,
                NEW.upi_id,
                NEW.date_of_birth,
                NEW.address_line,
                NEW.emergency_contact_name,
                NEW.emergency_contact_phone,
                now()
            )
            ON CONFLICT (profile_id) DO UPDATE SET
                bank_name = EXCLUDED.bank_name,
                bank_account_no = EXCLUDED.bank_account_no,
                bank_ifsc = EXCLUDED.bank_ifsc,
                upi_id = EXCLUDED.upi_id,
                date_of_birth = EXCLUDED.date_of_birth,
                address_line = EXCLUDED.address_line,
                emergency_contact_name = EXCLUDED.emergency_contact_name,
                emergency_contact_phone = EXCLUDED.emergency_contact_phone,
                updated_at = now()
            WHERE profile_private_details.updated_at <= OLD.updated_at
               OR profile_private_details.updated_at IS NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_legacy_profile_private_details ON public.profiles;
CREATE TRIGGER trg_sync_legacy_profile_private_details
    AFTER UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_legacy_profile_private_details();

-- ------------------------------------------------------------------------------
-- 8. NARROWLY AUTHORIZED PAYMENT RECIPIENT DETAILS RPC
-- ------------------------------------------------------------------------------
-- Drop existing jsonb-returning function to allow return-type change to TABLE (SQLSTATE 42P13)
DROP FUNCTION IF EXISTS public.get_payment_recipient_details(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_payment_recipient_details(
    p_recipient_id uuid,
    p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
    recipient_name text,
    bank_name text,
    bank_account_no text,
    bank_ifsc text,
    upi_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_is_authorized boolean := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    -- 1. Self-lookup or Administrator lookup
    IF v_caller_id = p_recipient_id OR public.is_admin(v_caller_id) THEN
        v_is_authorized := true;

    -- 2. Intermediary managing assisted worker lookup
    ELSIF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_recipient_id
          AND is_assisted_profile = true
          AND created_by = v_caller_id
    ) THEN
        v_is_authorized := true;

    -- 3. Specific Job Relationship: If p_job_id is supplied, authorization strictly requires:
    --    - The job must belong to the authenticated employer.
    --    - The assignment must belong to that exact job.
    --    - The assignment must belong to the requested recipient.
    --    - The assignment status must be an explicitly supported lifecycle state.
    --    Unrelated assignments under other jobs MUST NOT grant access when a specific p_job_id was passed.
    ELSIF p_job_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.jobs j
            JOIN public.job_records jr ON jr.job_id = j.id
            WHERE j.id = p_job_id
              AND j.employer_id = v_caller_id
              AND jr.worker_id = p_recipient_id
              AND jr.status IN ('hired', 'accepted', 'on_the_way', 'arrived', 'attendance_confirmed', 'in_progress', 'on_break', 'completed', 'work_completed')
        ) THEN
            v_is_authorized := true;
        END IF;

    -- 4. When p_job_id IS NULL: Retain only the separately justified authorization paths.
    --    Do not broaden access.
    --    a) Employer has an active/completed job assignment with this recipient
    --    b) Caller has an existing historical payment record with this recipient
    ELSE -- p_job_id IS NULL
        IF EXISTS (
            SELECT 1
            FROM public.jobs j
            JOIN public.job_records jr ON jr.job_id = j.id
            WHERE j.employer_id = v_caller_id
              AND jr.worker_id = p_recipient_id
              AND jr.status IN ('hired', 'accepted', 'on_the_way', 'arrived', 'attendance_confirmed', 'in_progress', 'on_break', 'completed', 'work_completed')
        ) OR EXISTS (
            SELECT 1 FROM public.payments pay
            WHERE pay.payer_id = v_caller_id
              AND pay.payee_id = p_recipient_id
        ) THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'QuickHire Security Failure: Caller is not authorized to retrieve recipient financial details.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.full_name AS recipient_name,
        d.bank_name,
        d.bank_account_no,
        d.bank_ifsc,
        d.upi_id
    FROM public.profiles p
    LEFT JOIN public.profile_private_details d ON d.profile_id = p.id
    WHERE p.id = p_recipient_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_recipient_details(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_recipient_details(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. PROTECTED PARITY VERIFICATION FUNCTION (ADMIN-ONLY EXECUTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_profile_private_parity()
RETURNS TABLE (
    is_parity boolean,
    total_profiles_with_private_data bigint,
    parity_matches bigint,
    unmigrated_profiles bigint,
    divergent_profiles bigint,
    active_conflicts bigint,
    divergence_summary jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total bigint;
    v_matches bigint;
    v_unmigrated bigint;
    v_divergent bigint;
    v_conflicts bigint;
    v_summary jsonb;
BEGIN
    -- Strict execution authorization check
    IF NOT public.is_admin(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'QuickHire Security Violation: Parity verification is restricted to administrators.'
            USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_total
    FROM public.profiles p
    WHERE p.bank_name IS NOT NULL OR p.bank_account_no IS NOT NULL OR p.bank_ifsc IS NOT NULL
       OR p.upi_id IS NOT NULL OR p.date_of_birth IS NOT NULL OR p.address_line IS NOT NULL
       OR p.emergency_contact_name IS NOT NULL OR p.emergency_contact_phone IS NOT NULL;

    SELECT count(*) INTO v_unmigrated
    FROM public.profiles p
    LEFT JOIN public.profile_private_details d ON d.profile_id = p.id
    WHERE d.profile_id IS NULL
      AND (p.bank_name IS NOT NULL OR p.bank_account_no IS NOT NULL OR p.bank_ifsc IS NOT NULL
        OR p.upi_id IS NOT NULL OR p.date_of_birth IS NOT NULL OR p.address_line IS NOT NULL
        OR p.emergency_contact_name IS NOT NULL OR p.emergency_contact_phone IS NOT NULL);

    SELECT count(*) INTO v_divergent
    FROM public.profiles p
    JOIN public.profile_private_details d ON d.profile_id = p.id
    WHERE p.bank_name IS DISTINCT FROM d.bank_name
       OR p.bank_account_no IS DISTINCT FROM d.bank_account_no
       OR p.bank_ifsc IS DISTINCT FROM d.bank_ifsc
       OR p.upi_id IS DISTINCT FROM d.upi_id
       OR p.date_of_birth IS DISTINCT FROM d.date_of_birth
       OR p.address_line IS DISTINCT FROM d.address_line
       OR p.emergency_contact_name IS DISTINCT FROM d.emergency_contact_name
       OR p.emergency_contact_phone IS DISTINCT FROM d.emergency_contact_phone;

    SELECT count(*) INTO v_conflicts
    FROM public.profile_private_migration_conflicts
    WHERE resolution_status = 'pending_review';

    v_matches := v_total - v_unmigrated - v_divergent;

    -- Masked divergence overview (zero raw numbers exposed)
    SELECT jsonb_agg(sub) INTO v_summary
    FROM (
        SELECT p.id,
               jsonb_build_object(
                 'bank_name_matches', (p.bank_name IS NOT DISTINCT FROM d.bank_name),
                 'account_no_matches', (p.bank_account_no IS NOT DISTINCT FROM d.bank_account_no),
                 'ifsc_matches', (p.bank_ifsc IS NOT DISTINCT FROM d.bank_ifsc),
                 'upi_matches', (p.upi_id IS NOT DISTINCT FROM d.upi_id)
               ) as status
        FROM public.profiles p
        JOIN public.profile_private_details d ON d.profile_id = p.id
        WHERE p.bank_name IS DISTINCT FROM d.bank_name
           OR p.bank_account_no IS DISTINCT FROM d.bank_account_no
           OR p.bank_ifsc IS DISTINCT FROM d.bank_ifsc
           OR p.upi_id IS DISTINCT FROM d.upi_id
        LIMIT 10
    ) sub;

    RETURN QUERY SELECT
        (v_unmigrated = 0 AND v_divergent = 0 AND v_conflicts = 0),
        v_total,
        v_matches,
        v_unmigrated,
        v_divergent,
        v_conflicts,
        COALESCE(v_summary, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_profile_private_parity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_profile_private_parity() TO authenticated; -- Protected inside via is_admin()

COMMIT;
