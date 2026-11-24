-- Restore the narrowly authorized recipient banking-details RPC used by
-- DirectPaymentModal. Never expose profile_private_details through a broad policy.
BEGIN;

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

    -- Self lookup or administrator lookup.
    IF v_caller_id = p_recipient_id OR public.is_admin(v_caller_id) THEN
        v_is_authorized := true;

    -- An intermediary may access only the assisted profile they created.
    ELSIF EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = p_recipient_id
          AND is_assisted_profile = true
          AND created_by = v_caller_id
    ) THEN
        v_is_authorized := true;

    -- A supplied job ID must match this employer, this recipient and a
    -- supported assignment lifecycle state.
    ELSIF p_job_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.jobs j
            JOIN public.job_records jr ON jr.job_id = j.id
            WHERE j.id = p_job_id
              AND j.employer_id = v_caller_id
              AND jr.worker_id = p_recipient_id
              AND jr.status IN (
                'hired', 'accepted', 'on_the_way', 'arrived',
                'attendance_confirmed', 'in_progress', 'on_break',
                'completed', 'work_completed'
              )
        ) THEN
            v_is_authorized := true;
        END IF;

    -- Without a job ID, retain only an existing job or payment relationship.
    ELSE
        IF EXISTS (
            SELECT 1
            FROM public.jobs j
            JOIN public.job_records jr ON jr.job_id = j.id
            WHERE j.employer_id = v_caller_id
              AND jr.worker_id = p_recipient_id
              AND jr.status IN (
                'hired', 'accepted', 'on_the_way', 'arrived',
                'attendance_confirmed', 'in_progress', 'on_break',
                'completed', 'work_completed'
              )
        ) OR EXISTS (
            SELECT 1
            FROM public.payments pay
            WHERE pay.payer_id = v_caller_id
              AND pay.payee_id = p_recipient_id
        ) THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Caller is not authorized to retrieve recipient financial details.'
          USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT p.full_name, d.bank_name, d.bank_account_no, d.bank_ifsc, d.upi_id
    FROM public.profiles p
    LEFT JOIN public.profile_private_details d ON d.profile_id = p.id
    WHERE p.id = p_recipient_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_recipient_details(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_recipient_details(uuid, uuid) TO authenticated;

COMMIT;
