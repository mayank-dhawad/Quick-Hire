-- Regression test: legacy custom OTP storage must not be exposed to app roles.
DO $$
DECLARE
  v_policy_count integer;
  v_role text;
  v_privilege text;
BEGIN
  IF to_regclass('public.phone_otps') IS NULL THEN
    RAISE NOTICE 'Legacy phone_otps table is absent; nothing to expose.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'phone_otps';
  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'phone_otps must have no RLS policies; found %', v_policy_count;
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      IF has_table_privilege(v_role, 'public.phone_otps', v_privilege) THEN
        RAISE EXCEPTION 'Unexpected % privilege on phone_otps for role %', v_privilege, v_role;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.phone_otps'::regclass) THEN
    RAISE EXCEPTION 'RLS must remain enabled on phone_otps';
  END IF;
  RAISE NOTICE 'Legacy phone_otps exposure checks passed.';
END
$$;
