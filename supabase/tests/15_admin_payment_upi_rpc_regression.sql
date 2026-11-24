-- Admin payment reconciliation receives only UPI identifiers through a
-- guarded RPC; ordinary users retain owner-only access to private details.
DO $$
DECLARE
  v_def text;
  v_select_admin_policies integer;
BEGIN
  IF to_regprocedure('public.get_admin_payment_upi(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'get_admin_payment_upi RPC is missing';
  END IF;

  IF has_function_privilege('anon','public.get_admin_payment_upi(uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not call get_admin_payment_upi';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_admin_payment_upi(uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must be able to call the guarded UPI RPC';
  END IF;

  SELECT pg_get_functiondef('public.get_admin_payment_upi(uuid[])'::regprocedure)
  INTO v_def;
  IF v_def NOT ILIKE '%is_admin(auth.uid())%'
     OR v_def NOT ILIKE '%profile_private_details%'
     OR v_def NOT ILIKE '%d.upi_id%' THEN
    RAISE EXCEPTION 'UPI RPC must enforce admin authorization and return only UPI values';
  END IF;

  SELECT count(*) INTO v_select_admin_policies
  FROM pg_policies
  WHERE schemaname='public' AND tablename='profile_private_details'
    AND cmd='SELECT' AND qual ILIKE '%is_admin%';
  IF v_select_admin_policies <> 0 THEN
    RAISE EXCEPTION 'Do not grant broad admin SELECT access to profile_private_details';
  END IF;
END
$$;
