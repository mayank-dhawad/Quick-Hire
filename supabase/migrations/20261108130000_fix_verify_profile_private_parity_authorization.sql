-- ==============================================================================
-- QuickHire Forward-Only Database Migration: Parity Verification Authorization Fix
-- Migration: 20261108130000_fix_verify_profile_private_parity_authorization.sql
-- Description:
--   Hardens public.verify_profile_private_parity() authorization logic by replacing
--   the flawed current_user check (which bypassed authorization inside SECURITY DEFINER)
--   with trusted caller identity (auth.uid()) and role (auth.role()) validation.
--
-- Access Control:
--   - Registered administrators (verified via public.is_admin()): PERMITTED
--   - Supabase service_role: PERMITTED
--   - Ordinary authenticated non-admin users: REJECTED with SQLSTATE 42501
--   - Anonymous callers (anon / PUBLIC): REJECTED (EXECUTE revoked & SQLSTATE 42501)
-- ==============================================================================

-- Ensure transaction safety
BEGIN;

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
    v_caller_id uuid;
    v_caller_role text;
    v_is_admin boolean := false;
    v_total bigint;
    v_matches bigint;
    v_unmigrated bigint;
    v_divergent bigint;
    v_conflicts bigint;
    v_summary jsonb;
BEGIN
    -- Strict execution authorization check:
    -- Verify trusted caller identity and JWT role without relying on current_user
    -- inside a SECURITY DEFINER context. Rejects anonymous callers and ordinary
    -- non-admin authenticated users, while preserving legitimate administrators
    -- (registered in public.admin_users) and trusted service_role callers.
    BEGIN
        v_caller_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_caller_id := NULL;
    END;

    BEGIN
        v_caller_role := auth.role();
    EXCEPTION WHEN OTHERS THEN
        v_caller_role := NULL;
    END;

    IF v_caller_role IS NULL OR v_caller_role = '' THEN
        BEGIN
            v_caller_role := current_setting('request.jwt.claim.role', true);
        EXCEPTION WHEN OTHERS THEN
            v_caller_role := NULL;
        END;
    END IF;

    IF v_caller_role = 'service_role' THEN
        v_is_admin := true;
    ELSIF v_caller_id IS NOT NULL THEN
        v_is_admin := public.is_admin(v_caller_id);
    END IF;

    IF NOT v_is_admin THEN
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

-- Reset and configure execute privileges
REVOKE ALL ON FUNCTION public.verify_profile_private_parity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_profile_private_parity() TO authenticated, service_role;

COMMENT ON FUNCTION public.verify_profile_private_parity() IS 'Reports synchronization metrics and divergence between public.profiles legacy columns and private details. Restricted to authenticated administrators and service_role.';

COMMIT;

