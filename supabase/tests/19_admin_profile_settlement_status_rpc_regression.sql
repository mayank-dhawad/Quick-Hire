-- Verify that administrators receive only settlement configuration booleans.
BEGIN;

DO $test$
DECLARE
  v_fn regprocedure := to_regprocedure('public.get_admin_profile_settlement_status(uuid[])');
  v_is_definer boolean;
  v_config text[];
  v_result text;
  v_denied boolean := false;
BEGIN
  IF v_fn IS NULL THEN RAISE EXCEPTION 'Admin settlement status RPC is missing.'; END IF;

  SELECT p.prosecdef, p.proconfig, pg_get_function_result(p.oid)
    INTO v_is_definer, v_config, v_result
  FROM pg_proc AS p WHERE p.oid = v_fn;

  IF NOT v_is_definer
     OR NOT EXISTS (SELECT 1 FROM unnest(COALESCE(v_config, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%')
     OR v_result NOT ILIKE '%profile_id uuid%'
     OR v_result NOT ILIKE '%bank_account_configured boolean%'
     OR v_result NOT ILIKE '%upi_configured boolean%' THEN
    RAISE EXCEPTION 'Admin settlement RPC must be SECURITY DEFINER with a fixed search path and boolean-only result.';
  END IF;

  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Admin settlement RPC execution grants are incorrect.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM * FROM public.get_admin_profile_settlement_status(
      ARRAY['22222222-2222-2222-2222-222222222222'::uuid]
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Non-admin authenticated user accessed settlement configuration.'; END IF;
END;
$test$;

ROLLBACK;
