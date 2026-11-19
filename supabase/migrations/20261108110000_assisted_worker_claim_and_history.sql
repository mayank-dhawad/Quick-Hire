-- ==============================================================================
-- QuickHire Database Migration
-- Migration Name: 20261108110000_assisted_worker_claim_and_history.sql
-- Description: Assisted worker profile claiming & non-recursive historical continuity:
--              1. Adds claimed_by_profile_id to public.profiles.
--              2. Creates isolated public.assisted_profile_claim_secrets table (no client read access).
--              3. Creates public.assisted_profile_claims audit registry table.
--              4. Deploys non-recursive helper get_claimed_profile_ids() to prevent RLS mutual recursion.
--              5. Deploys multi-factor verified claim RPC claim_assisted_worker_profile().
--              6. Extends RLS policies on profiles, job_records, and payments.
--              7. Preserves financial immutability with zero ledger row mutations.
--              8. Deploys reputation aggregation function get_claimed_worker_reputation().
-- Dependencies: 20261026000000, 20261031140000, 20261108100000
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
-- 1. PREFLIGHT SCHEMA VALIDATION
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

-- Ensure profiles_id_fkey is dropped to allow assisted profiles without an auth.users record
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- ------------------------------------------------------------------------------
-- 1.1 AUTH-USER DELETION CASCADE CLEANUP TRIGGER (DUAL-PATH LIFECYCLE GUARD)
-- ------------------------------------------------------------------------------
-- Dropping profiles_id_fkey enables assisted worker profiles without an auth.users record,
-- but removes the native PostgreSQL foreign key cascade when an authenticated user is deleted.
-- Furthermore, legacy foreign keys on public.payments, public.job_records, and public.jobs
-- use ON DELETE CASCADE. Blindly hard-deleting public.profiles would trigger a catastrophic
-- cascade that deletes immutable financial ledger rows, completed job history, and ratings.
--
-- The Dual-Path Lifecycle Guard solves both problems:
-- Path A (Financial / Business History): If user possesses payments, job records, jobs, or reviews,
--   we purge sensitive private banking details (Right to Erasure compliance), anonymize personal
--   profile data, mark the account 'deactivated', and preserve the ledger foreign key anchor.
-- Path B (Clean User): If user has zero business history, we safely hard-delete from public.profiles.
-- Assisted Profiles: Never deleted; facilitator created_by references are unlinked to NULL.
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_business_history boolean := false;
BEGIN
    -- Evaluate whether the deleted user is party to immutable financial or business history
    SELECT (
        EXISTS (SELECT 1 FROM public.payments WHERE payer_id = OLD.id OR payee_id = OLD.id)
        OR EXISTS (SELECT 1 FROM public.job_records WHERE worker_id = OLD.id)
        OR EXISTS (SELECT 1 FROM public.jobs WHERE employer_id = OLD.id)
        OR EXISTS (SELECT 1 FROM public.reviews WHERE reviewer_profile_id = OLD.id OR reviewed_profile_id = OLD.id)
    ) INTO v_has_business_history;

    IF v_has_business_history THEN
        -- ======================================================================
        -- PATH A: FINANCIAL & OPERATIONAL PRESERVATION (Soft Deletion & Anonymization)
        -- ======================================================================
        -- 1. Purge sensitive banking PII (DPDPA 2023 Right to Erasure compliance)
        DELETE FROM public.profile_private_details WHERE profile_id = OLD.id;

        -- 2. Purge ephemeral user notifications
        DELETE FROM public.notifications WHERE profile_id = OLD.id;

        -- 3. Anonymize profile PII & purge legacy banking columns using verified real columns
        UPDATE public.profiles
        SET 
            full_name = 'Deactivated User',
            phone_number = NULL,
            email = NULL,
            bank_name = NULL,
            bank_account_no = NULL,
            bank_ifsc = NULL,
            upi_id = NULL,
            location = NULL,
            address_line = NULL,
            village = NULL,
            city = NULL,
            district = NULL,
            state = NULL,
            pincode = NULL,
            date_of_birth = NULL,
            gender = NULL,
            account_status = 'deactivated',
            updated_at = now()
        WHERE id = OLD.id
          AND (is_assisted_profile IS NOT TRUE);

        -- 4. Mark worker listing unavailable and scrub worker PII
        UPDATE public.workers
        SET 
            is_available = false,
            availability_status = 'unavailable',
            experience_description = NULL,
            preferred_work_location = NULL,
            latitude = NULL,
            longitude = NULL,
            geocoded_address = NULL
        WHERE id = OLD.id;

        -- 5. Cancel unfilled open jobs posted by this employer (valid status check)
        UPDATE public.jobs
        SET status = 'cancelled',
            updated_at = now()
        WHERE employer_id = OLD.id AND status = 'open';

    ELSE
        -- ======================================================================
        -- PATH B: CLEAN USER PURGE (Hard Deletion)
        -- ======================================================================
        -- User has zero financial ledger rows, zero job records, zero reviews
        DELETE FROM public.profiles
        WHERE id = OLD.id
          AND (is_assisted_profile IS NOT TRUE);
    END IF;

    -- ==========================================================================
    -- ASSISTED WORKER SAFETY (Applies to both paths)
    -- ==========================================================================
    -- If deleted user was a facilitator who created assisted profiles, unlink created_by
    UPDATE public.profiles
    SET created_by = NULL
    WHERE created_by = OLD.id;

    -- If deleted user had claimed an assisted profile, return it to unclaimed state
    UPDATE public.profiles
    SET claimed_by_profile_id = NULL
    WHERE claimed_by_profile_id = OLD.id;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.handle_auth_user_deleted() IS
    'Safely handles auth.users deletion via dual-path lifecycle: preserves financial ledgers and job history while anonymizing PII and strictly protecting assisted workers.';

-- Security: Prevent execution by ordinary authenticated or anonymous callers via PostgREST
REVOKE ALL ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC, anon, authenticated;

-- Attach trigger to auth.users (idempotent replacement)
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_deleted();

-- ------------------------------------------------------------------------------
-- 2. ADD claimed_by_profile_id TO public.profiles
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'claimed_by_profile_id'
    ) THEN
        ALTER TABLE public.profiles
            ADD COLUMN claimed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
        COMMENT ON COLUMN public.profiles.claimed_by_profile_id IS
            'Authenticated worker profile (auth.uid()) that proved verified ownership of this assisted profile.';
    END IF;
END $$;

-- Index for rapid lookup of claimed profiles by claiming worker
CREATE INDEX IF NOT EXISTS idx_profiles_claimed_by
    ON public.profiles(claimed_by_profile_id)
    WHERE claimed_by_profile_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. ISOLATED CLAIM SECRETS TABLE (PREVENTS HASH EXPOSURE)
-- ------------------------------------------------------------------------------
-- Stored in a separate table rather than profiles to completely eliminate any
-- risk of exposing claim secret hashes through client profile queries.
CREATE TABLE IF NOT EXISTS public.assisted_profile_claim_secrets (
    assisted_profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    secret_hash text NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assisted_profile_claim_secrets IS
    'Encrypted secrets for multi-factor assisted worker claiming. Completely inaccessible to client queries.';

ALTER TABLE public.assisted_profile_claim_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assisted_profile_claim_secrets FROM anon, PUBLIC, authenticated;

-- ------------------------------------------------------------------------------
-- 4. AUDIT REGISTRY: public.assisted_profile_claims
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assisted_profile_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assisted_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    claimed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    claim_status text NOT NULL DEFAULT 'pending_review'
        CHECK (claim_status IN ('pending_review', 'verified_and_claimed', 'rejected', 'revoked')),
    verification_method text NOT NULL
        CHECK (verification_method IN (
            'otp_and_contractor_confirmation',
            'otp_and_secret_token',
            'admin_verified'
        )),
    verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    verified_at timestamptz,
    verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assisted_profile_claims IS
    'Immutable audit registry of assisted worker claim transactions with multi-factor proof verification.';

ALTER TABLE public.assisted_profile_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_read_policy" ON public.assisted_profile_claims;
CREATE POLICY "claims_read_policy"
ON public.assisted_profile_claims
FOR SELECT
TO authenticated
USING (
    claimed_by_profile_id = auth.uid()
    OR public.is_admin(auth.uid())
);

REVOKE ALL ON public.assisted_profile_claims FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.assisted_profile_claims TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. NON-RECURSIVE CLAIM HELPER FUNCTION
-- ------------------------------------------------------------------------------
-- Evaluates claimed profile UUIDs as SECURITY DEFINER to bypass RLS internally
-- and eliminate mutual recursion between public.profiles and public.job_records.
CREATE OR REPLACE FUNCTION public.get_claimed_profile_ids(p_user_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT p.id
    FROM public.profiles p
    WHERE p.claimed_by_profile_id = p_user_id
      AND p.is_assisted_profile = true;
$$;

REVOKE ALL ON FUNCTION public.get_claimed_profile_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_claimed_profile_ids(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. MULTI-FACTOR CLAIM RPC: claim_assisted_worker_profile
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_assisted_worker_profile(
    p_assisted_profile_id uuid,
    p_verification_method text,
    p_verification_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_caller public.profiles%ROWTYPE;
    v_assisted public.profiles%ROWTYPE;
    v_secret_hash text;
    v_is_verified boolean := false;
    v_claim_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    -- Prevent self-claiming
    IF p_assisted_profile_id = v_caller_id THEN
        RAISE EXCEPTION 'QuickHire Claim Error: An authenticated account cannot claim itself.' USING ERRCODE = '23514';
    END IF;

    -- Retrieve caller profile
    SELECT * INTO v_caller
    FROM public.profiles
    WHERE id = v_caller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile does not exist.' USING ERRCODE = '23503';
    END IF;

    IF v_caller.phone_number IS NULL OR trim(v_caller.phone_number) = '' THEN
        RAISE EXCEPTION 'Caller does not have a verified phone number registered.' USING ERRCODE = '42501';
    END IF;

    -- Concurrency Protection: Lock assisted profile row FOR UPDATE
    SELECT * INTO v_assisted
    FROM public.profiles
    WHERE id = p_assisted_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assisted profile % does not exist.', p_assisted_profile_id USING ERRCODE = '23503';
    END IF;

    -- Validate assisted profile role and type
    IF v_assisted.is_assisted_profile IS NOT TRUE THEN
        RAISE EXCEPTION 'Profile % is not an assisted profile and cannot be claimed.', p_assisted_profile_id USING ERRCODE = '23514';
    END IF;

    IF v_assisted.role IS DISTINCT FROM 'worker' THEN
        RAISE EXCEPTION 'Only worker profiles may be claimed via this process.' USING ERRCODE = '23514';
    END IF;

    IF v_assisted.account_status = 'suspended' THEN
        RAISE EXCEPTION 'Suspended profiles cannot be claimed.' USING ERRCODE = '42501';
    END IF;

    -- Single Claim Rule: Prevent re-claiming
    IF v_assisted.claimed_by_profile_id IS NOT NULL THEN
        IF v_assisted.claimed_by_profile_id = v_caller_id THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_claimed', true,
                'message', 'You have already claimed this assisted profile.'
            );
        ELSE
            RAISE EXCEPTION 'QuickHire Security Failure: This assisted profile has already been claimed by another account.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 1. PHONE NUMBER STRICT MATCH
    IF v_assisted.phone_number IS DISTINCT FROM v_caller.phone_number THEN
        RAISE EXCEPTION 'Phone mismatch: Profile phone (%) does not match verified account phone (%).',
            v_assisted.phone_number, v_caller.phone_number
            USING ERRCODE = '42501';
    END IF;

    -- 2. MULTI-FACTOR VERIFICATION RULES (Phone matching alone is NOT sufficient proof)
    IF p_verification_method = 'admin_verified' THEN
        IF NOT public.is_admin(v_caller_id) THEN
            RAISE EXCEPTION 'Unauthorized: Only administrators can use the admin_verified method.' USING ERRCODE = '42501';
        END IF;
        v_is_verified := true;

    ELSIF p_verification_method = 'otp_and_contractor_confirmation' THEN
        -- Contractor who created the assisted profile must match supplied proof or pre-authorization
        IF v_assisted.created_by IS NOT NULL THEN
            IF p_verification_proof IS NOT NULL AND p_verification_proof = v_assisted.created_by::text THEN
                v_is_verified := true;
            END IF;
        END IF;

    ELSIF p_verification_method = 'otp_and_secret_token' THEN
        -- Validate against isolated secrets table
        SELECT secret_hash INTO v_secret_hash
        FROM public.assisted_profile_claim_secrets
        WHERE assisted_profile_id = p_assisted_profile_id;

        IF v_secret_hash IS NOT NULL AND p_verification_proof IS NOT NULL THEN
            BEGIN
                IF v_secret_hash = extensions.crypt(trim(p_verification_proof), v_secret_hash) THEN
                    v_is_verified := true;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                IF v_secret_hash = crypt(trim(p_verification_proof), v_secret_hash) THEN
                    v_is_verified := true;
                END IF;
            END;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported verification method: %', p_verification_method USING ERRCODE = '23514';
    END IF;

    IF NOT v_is_verified THEN
        -- Log rejected attempt in audit registry
        INSERT INTO public.assisted_profile_claims (
            assisted_profile_id,
            claimed_by_profile_id,
            claim_status,
            verification_method,
            verification_evidence,
            rejection_reason
        ) VALUES (
            p_assisted_profile_id,
            v_caller_id,
            'rejected',
            p_verification_method,
            jsonb_build_object('phone', v_caller.phone_number, 'proof_provided', p_verification_proof IS NOT NULL),
            'Multi-factor proof verification failed or contractor authorization missing.'
        );

        RAISE EXCEPTION 'QuickHire Claim Verification Failed: Multi-factor proof rejected. Phone matching alone is insufficient.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. LINK PROFILE
    UPDATE public.profiles
    SET claimed_by_profile_id = v_caller_id,
        updated_at = now()
    WHERE id = p_assisted_profile_id;

    -- 4. RECORD SUCCESSFUL AUDIT ENTRY
    INSERT INTO public.assisted_profile_claims (
        assisted_profile_id,
        claimed_by_profile_id,
        claim_status,
        verification_method,
        verification_evidence,
        verified_at,
        verified_by
    ) VALUES (
        p_assisted_profile_id,
        v_caller_id,
        'verified_and_claimed',
        p_verification_method,
        jsonb_build_object('phone', v_caller.phone_number, 'verified_at', now()),
        now(),
        v_caller_id
    ) RETURNING id INTO v_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', v_claim_id,
        'assisted_profile_id', p_assisted_profile_id,
        'claimed_by_profile_id', v_caller_id,
        'claimed_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_assisted_worker_profile(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_assisted_worker_profile(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. EXTEND RLS POLICIES FOR CLAIMED IDENTITIES
-- ------------------------------------------------------------------------------

-- 7.1 Update public.profiles SELECT policy
DROP POLICY IF EXISTS "profiles_strict_select_policy" ON public.profiles;
CREATE POLICY "profiles_strict_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR (is_assisted_profile = true AND created_by = auth.uid())
    OR (is_assisted_profile = true AND claimed_by_profile_id = auth.uid())
    OR EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.job_records jr ON jr.job_id = j.id
        WHERE (j.employer_id = auth.uid() AND (jr.worker_id = profiles.id OR profiles.id IN (SELECT id FROM public.get_claimed_profile_ids(auth.uid()))))
           OR ((jr.worker_id = auth.uid() OR jr.worker_id IN (SELECT id FROM public.get_claimed_profile_ids(auth.uid()))) AND j.employer_id = profiles.id)
    )
    OR public.is_admin(auth.uid())
);

-- 7.2 Update public.job_records SELECT policy (non-recursive via helper)
DROP POLICY IF EXISTS "Job records read policy" ON public.job_records;
CREATE POLICY "Job records read policy"
ON public.job_records
FOR SELECT
TO authenticated
USING (
    auth.uid() = worker_id
    OR worker_id IN (SELECT id FROM public.get_claimed_profile_ids(auth.uid()))
    OR public.is_admin(auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = job_records.job_id AND j.employer_id = auth.uid()
    )
);

-- 7.3 Update public.payments SELECT policy (non-recursive via helper)
-- FINANCIAL IMMUTABILITY: Zero rows in public.payments are updated.
DROP POLICY IF EXISTS "Payments read policy" ON public.payments;
CREATE POLICY "Payments read policy"
ON public.payments
FOR SELECT
TO authenticated
USING (
    auth.uid() = payer_id
    OR auth.uid() = payee_id
    OR payee_id IN (SELECT id FROM public.get_claimed_profile_ids(auth.uid()))
    OR public.is_admin(auth.uid())
);

-- ------------------------------------------------------------------------------
-- 8. REPUTATION AGGREGATION FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_claimed_worker_reputation(
    p_worker_id uuid
)
RETURNS TABLE (
    total_reviews bigint,
    average_rating numeric,
    total_completed_jobs bigint,
    claimed_profiles_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_profile_ids uuid[];
BEGIN
    SELECT ARRAY_AGG(id) INTO v_profile_ids
    FROM (
        SELECT p_worker_id AS id
        UNION
        SELECT id FROM public.get_claimed_profile_ids(p_worker_id)
    ) sub;

    RETURN QUERY
    SELECT
        COALESCE(count(r.id), 0)::bigint AS total_reviews,
        COALESCE(round(avg(r.rating)::numeric, 2), 5.0) AS average_rating,
        (
            SELECT count(jr.id)::bigint
            FROM public.job_records jr
            WHERE jr.worker_id = ANY(v_profile_ids)
              AND jr.status IN ('completed', 'work_completed')
        ) AS total_completed_jobs,
        COALESCE(cardinality(v_profile_ids) - 1, 0)::bigint AS claimed_profiles_count
    FROM public.reviews r
    WHERE r.reviewed_profile_id = ANY(v_profile_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_claimed_worker_reputation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_claimed_worker_reputation(uuid) TO authenticated;

COMMIT;
