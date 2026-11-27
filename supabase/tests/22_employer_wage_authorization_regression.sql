-- Regression coverage for the post-audit employer-role and wage-payment guards.
DO $test$
DECLARE
  v_completion text;
  v_recipient text;
  v_payment text;
  v_insert_guard text;
  v_legacy_role_guard text;
BEGIN
  IF to_regprocedure('public.enforce_employer_work_completion()') IS NULL
     OR to_regprocedure('public.get_payment_recipient_details(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)') IS NULL
     OR to_regprocedure('public.enforce_worker_wage_payment_insert()') IS NULL THEN
    RAISE EXCEPTION 'One or more hardened wage authorization functions are missing';
  END IF;

  SELECT pg_get_functiondef('public.enforce_employer_work_completion()'::regprocedure) INTO v_completion;
  IF v_completion NOT ILIKE '%v_actor_role%'
     OR v_completion NOT ILIKE '%employer%'
     OR v_completion NOT ILIKE '%j.employer_id%'
     OR v_completion NOT ILIKE '%request.jwt.claim.role%' THEN
    RAISE EXCEPTION 'Completion trigger is missing Employer-role, job-owner, or service-role checks';
  END IF;

  SELECT pg_get_functiondef('public.get_payment_recipient_details(uuid,uuid)'::regprocedure) INTO v_recipient;
  IF v_recipient NOT ILIKE '%caller_profile.role = ''employer''%'
     OR v_recipient NOT ILIKE '%jr.worker_id%'
     OR v_recipient NOT ILIKE '%profile_private_details%'
     OR v_recipient NOT ILIKE '%is_admin%' THEN
    RAISE EXCEPTION 'Recipient-detail RPC is missing Employer-role and relationship checks';
  END IF;

  SELECT pg_get_functiondef('public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)'::regprocedure) INTO v_payment;
  IF v_payment NOT ILIKE '%v_actor_role%'
     OR v_payment NOT ILIKE '%employer%'
     OR v_payment NOT ILIKE '%p_idempotency_key%'
     OR v_payment NOT ILIKE '%trim(p_idempotency_key) <> trim(p_payment_reference)%'
     OR v_payment NOT ILIKE '%v_existing_payment.reference_id <> p_reference_id%' THEN
    RAISE EXCEPTION 'Payment RPC is missing Employer-role, idempotency, or UUID-safe comparison checks';
  END IF;

  SELECT pg_get_functiondef('public.enforce_worker_wage_payment_insert()'::regprocedure) INTO v_insert_guard;
  IF v_insert_guard NOT ILIKE '%NEW.payer_id%'
     OR v_insert_guard NOT ILIKE '%NEW.assignment_id%'
     OR v_insert_guard NOT ILIKE '%work_completed_at%'
     OR v_insert_guard NOT ILIKE '%employer%' THEN
    RAISE EXCEPTION 'Payment INSERT trigger is missing payer, assignment, completion, or role checks';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.payments'::regclass
      AND tgname='trg_enforce_worker_wage_payment_insert'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Worker wage payment INSERT trigger is not installed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='payments'
      AND indexname='payments_transaction_ref_unique_normalized_idx'
      AND indexdef ILIKE '%UNIQUE%'
  ) THEN
    RAISE EXCEPTION 'Normalized unique UTR index is missing';
  END IF;

  SELECT pg_get_functiondef('public.protect_profile_admin_role()'::regprocedure) INTO v_legacy_role_guard;
  IF v_legacy_role_guard NOT ILIKE '%request.jwt.claim.role%'
     OR v_legacy_role_guard NOT ILIKE '%IF v_is_service_role THEN%' THEN
    RAISE EXCEPTION 'Legacy admin-role trigger does not preserve trusted service-role provisioning';
  END IF;

  IF has_function_privilege('anon','public.enforce_worker_wage_payment_insert()','EXECUTE')
     OR has_function_privilege('authenticated','public.enforce_worker_wage_payment_insert()','EXECUTE') THEN
    RAISE EXCEPTION 'Internal wage-payment trigger function must not be exposed as a callable RPC';
  END IF;
END;
$test$;
