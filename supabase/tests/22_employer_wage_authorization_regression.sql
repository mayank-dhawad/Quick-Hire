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
     OR v_completion NOT ILIKE '%v_actor_status%'
     OR v_completion NOT ILIKE '%account_status%'
     OR v_completion NOT ILIKE '%employer%'
     OR v_completion NOT ILIKE '%j.employer_id%'
     OR v_completion NOT ILIKE '%request.jwt.claim.role%' THEN
    RAISE EXCEPTION 'Completion trigger is missing Employer-role, job-owner, or service-role checks';
  END IF;

  SELECT pg_get_functiondef('public.get_payment_recipient_details(uuid,uuid)'::regprocedure) INTO v_recipient;
  IF v_recipient NOT ILIKE '%caller_profile.role = ''employer''%'
     OR v_recipient NOT ILIKE '%account_status%'
     OR v_recipient NOT ILIKE '%jr.worker_id%'
     OR v_recipient NOT ILIKE '%profile_private_details%'
     OR v_recipient NOT ILIKE '%is_admin%' THEN
    RAISE EXCEPTION 'Recipient-detail RPC is missing Employer-role and relationship checks';
  END IF;

  SELECT pg_get_functiondef('public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)'::regprocedure) INTO v_payment;
  IF v_payment NOT ILIKE '%v_actor_role%'
     OR v_payment NOT ILIKE '%v_actor_status%'
     OR v_payment NOT ILIKE '%account_status%'
     OR v_payment NOT ILIKE '%employer%'
     OR v_payment NOT ILIKE '%p_idempotency_key%'
     OR v_payment NOT ILIKE '%trim(p_idempotency_key) <> trim(p_payment_reference)%'
     OR v_payment NOT ILIKE '%v_existing_payment.reference_id::text <> p_reference_id::text%' THEN
    RAISE EXCEPTION 'Payment RPC is missing Employer-role, idempotency, or UUID-safe comparison checks';
  END IF;

  SELECT pg_get_functiondef('public.enforce_worker_wage_payment_insert()'::regprocedure) INTO v_insert_guard;
  IF v_insert_guard NOT ILIKE '%NEW.payer_id%'
     OR v_insert_guard NOT ILIKE '%v_actor_status%'
     OR v_insert_guard NOT ILIKE '%account_status%'
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


-- Exercise the real legacy-data scenario: create a job as an Employer, then
-- simulate the existing account being changed to Worker by trusted provisioning.
-- The account must no longer complete work, retrieve worker bank details, or settle wages.
BEGIN;
DO $legacy$
DECLARE
  v_legacy_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_assigned_worker uuid := '33333333-3333-3333-3333-333333333333';
  v_job_id uuid := gen_random_uuid();
  v_assignment_id uuid;
  v_denied boolean;
  v_role text;
BEGIN
  -- Create the original job and assignment through the legitimate Employer path.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_legacy_owner::text, true);

  INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
  VALUES (v_job_id, v_legacy_owner, 'Legacy worker-owned job regression', 'Agriculture', 100, 1, 'open', 'direct_phone');

  INSERT INTO public.job_records (
    job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
  ) VALUES (
    v_job_id, v_assigned_worker, 'direct_phone', 'employer_reported_verbal_agreement', 'hired', 100, 100
  ) RETURNING id INTO v_assignment_id;

  -- Move the assignment to a valid pre-completion lifecycle state while the
  -- account is still a legitimate Employer. The later completion attempt must
  -- fail specifically because the profile has become a Worker.
  UPDATE public.job_records SET status = 'on_the_way' WHERE id = v_assignment_id;
  UPDATE public.job_records SET status = 'arrived' WHERE id = v_assignment_id;
  UPDATE public.job_records SET status = 'in_progress' WHERE id = v_assignment_id;

  -- Trusted backend repair must be able to provision and then set the role.
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.profiles SET role = 'admin' WHERE id = v_legacy_owner;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_legacy_owner;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Trusted service role could not provision an admin profile through the legacy trigger chain.';
  END IF;

  UPDATE public.profiles SET role = 'worker' WHERE id = v_legacy_owner;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_legacy_owner;
  IF v_role IS DISTINCT FROM 'worker' THEN
    RAISE EXCEPTION 'Trusted service role could not repair the profile back to Worker.';
  END IF;

  -- Execute as postgres so RLS cannot mask whether the authorization trigger
  -- itself rejects a Worker who still owns a legacy job.
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_legacy_owner::text, true);

  v_denied := false;
  BEGIN
    UPDATE public.job_records
    SET status = 'completed', work_completed_at = now()
    WHERE id = v_assignment_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Legacy Worker account completed work on a job it owns.';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.get_payment_recipient_details(v_assigned_worker, v_job_id);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Legacy Worker account retrieved another worker payment details.';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.record_direct_payment(
      'worker_wage', v_job_id, v_assignment_id, v_assigned_worker,
      100, 'Cash', 'QH-LEGACY-WORKER-ROLE-REGRESSION',
      NULL, 'QH-LEGACY-WORKER-ROLE-REGRESSION'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Legacy Worker account recorded wage payment for its own job.';
  END IF;
END;
$legacy$;
ROLLBACK;
