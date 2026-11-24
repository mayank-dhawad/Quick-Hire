-- Verify profile phone numbers are visible only to the owner, an authorized
-- employer/worker relationship, or an administrator. Contact access remains
-- available through the audited, rate-limited worker-contact RPC.
BEGIN;

DO $test$
DECLARE
  v_employer uuid := '11111111-1111-1111-1111-111111111111';
  v_worker uuid := '22222222-2222-2222-2222-222222222222';
  v_unrelated uuid := '66666666-6666-6666-6666-666666666666';
  v_admin uuid := '99999999-9999-9999-9999-999999999999';
  v_job_id uuid := gen_random_uuid();
  v_phone text;
  v_contact jsonb;
  v_denied boolean := false;
BEGIN
  -- Create a disposable real employer-to-worker relationship as service_role.
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO public.workers (id, category, skills, is_available)
  VALUES (v_worker, 'Agriculture', ARRAY['Farming'], true)
  ON CONFLICT (id) DO UPDATE SET is_available = true;

  INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
  VALUES (v_job_id, v_employer, 'Phone privacy regression fixture', 'Agriculture', 500, 1, 'open', 'application');

  -- Create the assignment through the real worker self-application path.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_worker::text, true);
  INSERT INTO public.job_records (job_id, worker_id, status, hiring_source, agreement_evidence_type)
  VALUES (v_job_id, v_worker, 'applied', 'application', 'worker_application_and_employer_acceptance');

  -- An unrelated authenticated user cannot read the worker's phone directly.
  PERFORM set_config('request.jwt.claim.sub', v_unrelated::text, true);
  SELECT phone_number INTO v_phone FROM public.profiles WHERE id = v_worker;
  IF FOUND THEN
    RAISE EXCEPTION 'Unrelated authenticated user read another worker phone number.';
  END IF;

  -- The same unrelated user cannot use the contact RPC to bypass the policy.
  BEGIN
    PERFORM public.get_worker_contact_phone(v_worker);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Unrelated authenticated user retrieved a worker contact through the RPC.';
  END IF;

  -- The employer with an existing job assignment retains contact access.
  PERFORM set_config('request.jwt.claim.sub', v_employer::text, true);
  SELECT phone_number INTO v_phone FROM public.profiles WHERE id = v_worker;
  IF NOT FOUND OR v_phone IS DISTINCT FROM '+919876543211' THEN
    RAISE EXCEPTION 'Authorized employer lost relationship-scoped worker phone visibility.';
  END IF;

  SELECT public.get_worker_contact_phone(v_worker) INTO v_contact;
  IF v_contact->>'phone_number' IS DISTINCT FROM '+919876543211' THEN
    RAISE EXCEPTION 'Authorized employer contact RPC did not return the worker phone.';
  END IF;

  -- The assigned worker retains access to the employer contact for the job.
  PERFORM set_config('request.jwt.claim.sub', v_worker::text, true);
  SELECT phone_number INTO v_phone FROM public.profiles WHERE id = v_employer;
  IF NOT FOUND OR v_phone IS DISTINCT FROM '+919876543210' THEN
    RAISE EXCEPTION 'Assigned worker lost relationship-scoped employer phone visibility.';
  END IF;

  -- Administrators retain legitimate user-management visibility.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT phone_number INTO v_phone FROM public.profiles WHERE id = v_unrelated;
  IF NOT FOUND OR v_phone IS DISTINCT FROM '+919876543216' THEN
    RAISE EXCEPTION 'Administrator lost authorized user phone visibility.';
  END IF;

  RAISE NOTICE 'Profile phone relationship privacy regression passed.';
END;
$test$;

ROLLBACK;
