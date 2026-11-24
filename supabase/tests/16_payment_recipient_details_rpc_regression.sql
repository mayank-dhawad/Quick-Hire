-- DirectPaymentModal needs a narrowly authorized recipient-detail RPC.
DO $$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.get_payment_recipient_details(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'get_payment_recipient_details RPC is missing';
  END IF;

  IF has_function_privilege('anon','public.get_payment_recipient_details(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not call get_payment_recipient_details';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_payment_recipient_details(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must retain recipient-details RPC access';
  END IF;

  SELECT pg_get_functiondef('public.get_payment_recipient_details(uuid,uuid)'::regprocedure)
  INTO v_def;
  IF v_def NOT ILIKE '%auth.uid()%'
     OR v_def NOT ILIKE '%j.employer_id%'
     OR v_def NOT ILIKE '%jr.worker_id%'
     OR v_def NOT ILIKE '%profile_private_details%'
     OR v_def NOT ILIKE '%is_admin%' THEN
    RAISE EXCEPTION 'Recipient-details RPC is missing required relationship and admin authorization checks';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profile_private_details'
      AND cmd='SELECT' AND qual ILIKE '%true%'
  ) THEN
    RAISE EXCEPTION 'Private profile details must not have a globally readable SELECT policy';
  END IF;
END
$$;
