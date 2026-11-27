-- Harden employer-only completion, recipient-detail access, and wage settlement.
-- Forward-only: preserves legacy job/payment rows and adds guards for new writes.
BEGIN;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE transaction_ref IS NOT NULL AND btrim(transaction_ref) <> ''
    GROUP BY lower(btrim(transaction_ref))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add normalized UTR uniqueness: duplicate transaction references already exist.';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.enforce_employer_work_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_is_service_role boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
    v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
    v_actor_role text;
BEGIN
    IF (
        (NEW.status IS DISTINCT FROM OLD.status
          AND (NEW.status IN ('completed', 'work_completed')
               OR OLD.status IN ('completed', 'work_completed')))
        OR NEW.work_completed_at IS DISTINCT FROM OLD.work_completed_at
    ) THEN
        IF NOT v_is_service_role AND NOT v_is_admin THEN
          IF v_actor_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required to confirm work completion.'
              USING ERRCODE = '42501';
          END IF;

          SELECT role INTO v_actor_role
          FROM public.profiles
          WHERE id = v_actor_id;

          IF v_actor_role IS DISTINCT FROM 'employer'
             OR NOT EXISTS (
               SELECT 1 FROM public.jobs j
               WHERE j.id = NEW.job_id AND j.employer_id = v_actor_id
             ) THEN
            RAISE EXCEPTION 'Only the Employer account that owns this job may mark its assignment as completed.'
              USING ERRCODE = '42501';
          END IF;
        END IF;

        IF NEW.status IN ('completed', 'work_completed')
           AND NEW.work_completed_at IS NULL THEN
            RAISE EXCEPTION 'A completion timestamp is required before an assignment can be marked completed.'
              USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_payment_recipient_details(p_recipient_id uuid, p_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(recipient_name text, bank_name text, bank_account_no text, bank_ifsc text, upi_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
              AND EXISTS (SELECT 1 FROM public.profiles caller_profile WHERE caller_profile.id = v_caller_id AND caller_profile.role = 'employer')
              AND jr.worker_id = p_recipient_id
              AND jr.status IN ('completed', 'work_completed')
              AND jr.work_completed_at IS NOT NULL
        ) THEN
            v_is_authorized := true;
        END IF;

    -- Without a job ID, retain only an existing job or payment relationship.
    ELSE
        IF EXISTS (
            SELECT 1 FROM public.profiles caller_profile
            WHERE caller_profile.id = v_caller_id AND caller_profile.role = 'employer'
        ) AND (
            EXISTS (
                SELECT 1
                FROM public.jobs j
                JOIN public.job_records jr ON jr.job_id = j.id
                WHERE j.employer_id = v_caller_id
                  AND jr.worker_id = p_recipient_id
                  AND jr.status IN ('completed', 'work_completed')
                  AND jr.work_completed_at IS NOT NULL
            ) OR EXISTS (
                SELECT 1
                FROM public.payments pay
                WHERE pay.payer_id = v_caller_id
                  AND pay.payee_id = p_recipient_id
            )
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
$function$;

CREATE OR REPLACE FUNCTION public.record_direct_payment(p_payment_for_type text, p_reference_id uuid, p_assignment_id uuid, p_payee_id uuid, p_amount numeric, p_payment_method text, p_payment_reference text, p_utr_number text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_id uuid;
    v_assignment record;
    v_job record;
    v_net_settled numeric := 0;
    v_pending_claims numeric := 0;
    v_total_payable numeric := 0;
    v_new_payment_id uuid;
    v_existing_payment record;
    v_status text;
    v_verification_status text;
    v_receipt_number text;
    v_clean_utr text;
    v_duplicate_utr_payment_id uuid;
    v_actor_role text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'QuickHire Security Failure: Authentication required to execute payment RPC.'
            USING ERRCODE = '42501';
    END IF;

    -- Only current Employer accounts may settle wages. Admins retain their
    -- explicit oversight exception; service-role writes remain trusted backend work.
    IF NOT public.is_admin(v_caller_id) THEN
        SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_caller_id;
        IF v_actor_role IS DISTINCT FROM 'employer' THEN
            RAISE EXCEPTION 'Only an Employer account may record worker wage payments.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NULLIF(trim(p_payment_reference), '') IS NULL
       OR NULLIF(trim(p_idempotency_key), '') IS NULL
       OR trim(p_idempotency_key) <> trim(p_payment_reference) THEN
        RAISE EXCEPTION 'A stable payment reference and matching idempotency key are required.'
            USING ERRCODE = '23514';
    END IF;

    -- ==========================================================================
    -- GUARD A: MACHINE RENTAL EXPLICIT REJECTION
    -- ==========================================================================
    -- As established in architecture audits, QuickHire currently lacks an
    -- authoritative equipment_bookings / rentals relationship table. Direct
    -- machine rental payments are disabled until a contractual booking table exists.
    IF p_payment_for_type = 'machine_rental' THEN
        RAISE EXCEPTION 'QuickHire Architecture Blocker: Machine rental settlements are disabled in record_direct_payment because no authoritative equipment_bookings relationship table exists in the database schema. Direct payments cannot be processed without a verified booking contract.'
            USING ERRCODE = '0A000'; -- feature_not_supported
    END IF;

    IF p_payment_for_type <> 'worker_wage' THEN
        RAISE EXCEPTION 'QuickHire Validation Error: Unsupported payment_for_type "%". Must be worker_wage.',
            p_payment_for_type USING ERRCODE = '23514';
    END IF;

    -- Strict Amount Validation
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'QuickHire Validation Error: Payment amount must be strictly greater than zero and cannot be NULL.'
            USING ERRCODE = '23514';
    END IF;

    -- Strict Payment Method Validation
    IF p_payment_method NOT IN ('Cash', 'Direct UPI', 'Net Banking (IMPS/NEFT)') THEN
        RAISE EXCEPTION 'QuickHire Validation Error: Invalid payment method "%". Must be Cash, Direct UPI, or Net Banking (IMPS/NEFT).',
            p_payment_method USING ERRCODE = '23514';
    END IF;

    -- UTR Reference Formatting & Global Uniqueness
    v_clean_utr := NULLIF(trim(p_utr_number), '');
    IF v_clean_utr IS NOT NULL THEN
        IF length(v_clean_utr) < 6 THEN
            RAISE EXCEPTION 'QuickHire Validation Error: Transaction UTR / reference number must be at least 6 characters.'
                USING ERRCODE = '23514';
        END IF;

        -- Global UTR uniqueness check (prevent recycling someone else's banking reference)
        SELECT id INTO v_duplicate_utr_payment_id
        FROM public.payments
        WHERE lower(btrim(transaction_ref)) = lower(v_clean_utr)
          AND (p_payment_reference IS NULL OR payment_reference <> p_payment_reference)
        LIMIT 1;

        IF v_duplicate_utr_payment_id IS NOT NULL THEN
            RAISE EXCEPTION 'QuickHire Payment Error: UTR / Reference number "%" has already been submitted for another payment (id: %).',
                v_clean_utr, v_duplicate_utr_payment_id USING ERRCODE = '23505';
        END IF;
    END IF;

    -- --------------------------------------------------------------------------
    -- IDEMPOTENCY: FULL PARAMETER COMPARISON
    -- --------------------------------------------------------------------------
    IF p_payment_reference IS NOT NULL THEN
        SELECT id, payer_id, payee_id, payment_for_type, reference_id, assignment_id, amount, payment_method, status
        INTO v_existing_payment
        FROM public.payments
        WHERE payment_reference = p_payment_reference
        LIMIT 1;

        IF v_existing_payment.id IS NOT NULL THEN
            -- Full parameter consistency check
            IF v_existing_payment.payer_id <> v_caller_id
               OR v_existing_payment.payee_id <> p_payee_id
               OR v_existing_payment.payment_for_type <> p_payment_for_type
               OR v_existing_payment.reference_id <> p_reference_id
               OR v_existing_payment.assignment_id <> p_assignment_id
               OR v_existing_payment.amount <> p_amount
               OR v_existing_payment.payment_method <> p_payment_method
            THEN
                RAISE EXCEPTION 'QuickHire Idempotency Violation: Payment reference "%" was already processed with different payment parameters.',
                    p_payment_reference USING ERRCODE = '23505';
            END IF;

            -- Exact match: return idempotent duplicate safely
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_duplicate', true,
                'payment_id', v_existing_payment.id,
                'status', v_existing_payment.status,
                'message', 'Payment attempt reference was already processed with identical parameters.'
            );
        END IF;
    END IF;

    -- ==========================================================================
    -- WORKER WAGE SETTLEMENT VALIDATION
    -- ==========================================================================
    IF p_assignment_id IS NULL THEN
        RAISE EXCEPTION 'QuickHire Relational Integrity Error: Worker wage payments strictly require an assignment_id (job_records.id).'
            USING ERRCODE = '23502';
    END IF;

    IF p_reference_id IS NULL THEN
        RAISE EXCEPTION 'QuickHire Relational Integrity Error: Worker wage payments require a parent job reference_id (jobs.id).'
            USING ERRCODE = '23502';
    END IF;

    -- Concurrency Protection: Lock assignment row FOR UPDATE
    SELECT id, job_id, worker_id, status, work_completed_at, agreed_wage, total_payable, total_paid, payment_status
    INTO v_assignment
    FROM public.job_records
    WHERE id = p_assignment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'QuickHire Relational Error: Job assignment record % does not exist.', p_assignment_id
            USING ERRCODE = '23503';
    END IF;

    -- Validate parent job ownership
    SELECT id, employer_id, status INTO v_job
    FROM public.jobs
    WHERE id = v_assignment.job_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'QuickHire Relational Error: Parent job % does not exist.', v_assignment.job_id
            USING ERRCODE = '23503';
    END IF;

    IF v_job.employer_id <> v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'QuickHire Authorization Failure: Caller is not the employer of job %.', v_job.id
            USING ERRCODE = '42501';
    END IF;

    -- Validate relationship consistency
    IF v_assignment.job_id <> p_reference_id THEN
        RAISE EXCEPTION 'QuickHire Relational Mismatch: Supplied reference_id (%) does not match assignment job_id (%).',
            p_reference_id, v_assignment.job_id USING ERRCODE = '23514';
    END IF;

    IF v_assignment.worker_id <> p_payee_id THEN
        RAISE EXCEPTION 'QuickHire Relational Mismatch: Supplied payee_id (%) does not match assignment worker_id (%).',
            p_payee_id, v_assignment.worker_id USING ERRCODE = '23514';
    END IF;

    -- Disallow payment on cancelled, rejected, or disputed assignments
    IF v_assignment.status IN ('rejected', 'cancelled', 'disputed') THEN
        RAISE EXCEPTION 'QuickHire Status Error: Cannot settle wage on assignment with status "%".', v_assignment.status
            USING ERRCODE = '23514';
    END IF;

    -- Wage settlement is available only after the employer records completion.
    IF v_assignment.status NOT IN ('completed', 'work_completed')
       OR v_assignment.work_completed_at IS NULL THEN
        RAISE EXCEPTION 'QuickHire Status Error: Wage payment is locked until the employer marks this work assignment as completed.'
            USING ERRCODE = '23514';
    END IF;

    -- Determine total payable
    v_total_payable := COALESCE(v_assignment.total_payable, v_assignment.agreed_wage, 0);
    IF v_total_payable <= 0 THEN
        SELECT offered_wages INTO v_total_payable
        FROM public.jobs
        WHERE id = v_assignment.job_id;
    END IF;

    -- Calculate currently settled balance
    SELECT COALESCE(SUM(
        CASE
            WHEN p.status IN ('completed', 'paid') AND p.verification_status IN ('user_reported', 'verified') THEN p.amount
            ELSE 0
        END
    ), 0)
    INTO v_net_settled
    FROM public.payments p
    WHERE p.assignment_id = v_assignment.id
      AND p.parent_payment_id IS NULL;

    -- Calculate pending claims
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_pending_claims
    FROM public.payments p
    WHERE p.assignment_id = v_assignment.id
      AND p.status = 'submitted'
      AND p.verification_status = 'pending_verification';

    -- Overpayment Guard
    IF v_total_payable > 0 AND (v_net_settled + v_pending_claims + p_amount) > v_total_payable THEN
        RAISE EXCEPTION 'QuickHire Overpayment Violation: Total payments and pending claims (₹%) exceed agreed payable (₹%). Settled: ₹%, Pending: ₹%, Attempted: ₹%.',
            (v_net_settled + v_pending_claims + p_amount), v_total_payable, v_net_settled, v_pending_claims, p_amount
            USING ERRCODE = '23514';
    END IF;

    -- Status determination
    IF p_payment_method = 'Cash' THEN
        v_status := 'completed';
        v_verification_status := 'user_reported';
        v_receipt_number := 'QH-CSH-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
    ELSE
        IF v_clean_utr IS NOT NULL THEN
            v_status := 'submitted';
            v_verification_status := 'pending_verification';
        ELSE
            v_status := 'pending';
            v_verification_status := 'unverified';
        END IF;
    END IF;

    -- Insert Payment Row
    INSERT INTO public.payments (
        payer_id,
        payee_id,
        payment_for_type,
        reference_id,
        assignment_id,
        amount,
        currency,
        payment_method,
        payment_reference,
        transaction_ref,
        receipt_number,
        status,
        verification_status,
        recorded_by,
        created_at,
        updated_at
    ) VALUES (
        v_caller_id,
        p_payee_id,
        'worker_wage',
        v_assignment.job_id,
        v_assignment.id,
        p_amount,
        'INR',
        p_payment_method,
        p_payment_reference,
        v_clean_utr,
        v_receipt_number,
        v_status,
        v_verification_status,
        v_caller_id,
        now(),
        now()
    ) RETURNING id INTO v_new_payment_id;

    -- Update job_records payment summary if Cash payment immediately settles
    IF v_status = 'completed' THEN
        UPDATE public.job_records
        SET total_paid = COALESCE(total_paid, 0) + p_amount,
            payment_status = CASE
                WHEN (COALESCE(total_paid, 0) + p_amount) >= v_total_payable THEN 'paid'
                ELSE 'partially_paid'
            END,
            updated_at = now()
        WHERE id = v_assignment.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_new_payment_id,
        'payment_for_type', 'worker_wage',
        'assignment_id', v_assignment.id,
        'job_id', v_assignment.job_id,
        'amount', p_amount,
        'status', v_status,
        'verification_status', v_verification_status,
        'receipt_number', v_receipt_number
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_worker_wage_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
  v_actor_role text;
  v_assignment record;
BEGIN
  IF NEW.payment_for_type <> 'worker_wage' THEN
    RETURN NEW;
  END IF;

  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  IF v_actor_id IS NULL OR NEW.payer_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Authenticated payment submissions must be recorded by the signed-in payer.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin THEN
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS DISTINCT FROM 'employer' THEN
      RAISE EXCEPTION 'Only an Employer account may record worker wage payments.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NULLIF(btrim(NEW.payment_reference), '') IS NULL THEN
    RAISE EXCEPTION 'A stable payment reference is required for every worker wage payment.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.assignment_id IS NULL OR NEW.reference_id IS NULL THEN
    RAISE EXCEPTION 'Worker wage payments require both job and assignment references.'
      USING ERRCODE = '23502';
  END IF;

  SELECT jr.id, jr.job_id, jr.worker_id, jr.status, jr.work_completed_at, j.employer_id
    INTO v_assignment
  FROM public.job_records jr
  JOIN public.jobs j ON j.id = jr.job_id
  WHERE jr.id = NEW.assignment_id
  FOR UPDATE OF jr;

  IF NOT FOUND
     OR v_assignment.job_id IS DISTINCT FROM NEW.reference_id
     OR v_assignment.worker_id IS DISTINCT FROM NEW.payee_id
     OR v_assignment.status NOT IN ('completed', 'work_completed')
     OR v_assignment.work_completed_at IS NULL THEN
    RAISE EXCEPTION 'Worker wage payment must match an existing completed assignment and its worker.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_is_admin AND v_assignment.employer_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only the Employer account that owns this job may record its wage payment.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_worker_wage_payment_insert() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_enforce_worker_wage_payment_insert ON public.payments;
CREATE TRIGGER trg_enforce_worker_wage_payment_insert
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_worker_wage_payment_insert();


CREATE UNIQUE INDEX IF NOT EXISTS payments_transaction_ref_unique_normalized_idx
ON public.payments (lower(btrim(transaction_ref)))
WHERE transaction_ref IS NOT NULL AND btrim(transaction_ref) <> '';

COMMIT;
