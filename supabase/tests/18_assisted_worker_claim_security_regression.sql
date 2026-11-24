-- Assisted-worker profile schema, authorization and historical continuity checks.
DO $$
DECLARE
  v_has_claim_column boolean;
  v_has_profile_auth_fk boolean;
  v_has_unique_phone boolean;
  v_has_claim_fk boolean;
  v_helper_def text;
  v_worker_id uuid;
  v_denied boolean:=false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='claimed_by_profile_id'
  ) INTO v_has_claim_column;
  IF NOT v_has_claim_column THEN RAISE EXCEPTION 'claimed_by_profile_id column is missing'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    JOIN pg_class r ON r.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE c.conrelid='public.profiles'::regclass AND c.contype='f'
      AND a.attname='id' AND n.nspname='auth' AND r.relname='users'
  ) INTO v_has_profile_auth_fk;
  IF v_has_profile_auth_fk THEN RAISE EXCEPTION 'profiles.id must support independent assisted-profile UUIDs'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.conrelid='public.profiles'::regclass AND c.contype='u' AND a.attname='phone_number'
  ) INTO v_has_unique_phone;
  IF v_has_unique_phone THEN RAISE EXCEPTION 'profiles.phone_number must allow a worker account and assisted profile to share a phone'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    JOIN pg_class r ON r.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE c.conrelid='public.profiles'::regclass AND c.contype='f'
      AND a.attname='claimed_by_profile_id' AND n.nspname='public' AND r.relname='profiles'
  ) INTO v_has_claim_fk;
  IF NOT v_has_claim_fk THEN RAISE EXCEPTION 'claimed_by_profile_id must reference profiles'; END IF;

  IF to_regclass('public.assisted_profile_claim_secrets') IS NULL
     OR to_regclass('public.assisted_profile_claims') IS NULL THEN
    RAISE EXCEPTION 'Assisted worker claim tables are missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.assisted_profile_claim_secrets'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.assisted_profile_claims'::regclass) THEN
    RAISE EXCEPTION 'Assisted worker claim tables must have RLS enabled';
  END IF;
  IF has_table_privilege('anon','public.assisted_profile_claim_secrets','SELECT')
     OR has_table_privilege('authenticated','public.assisted_profile_claim_secrets','SELECT') THEN
    RAISE EXCEPTION 'Claim secret hashes must not be readable by application roles';
  END IF;
  IF has_function_privilege('anon','public.normalize_quickhire_phone(text)','EXECUTE')
     OR has_function_privilege('authenticated','public.normalize_quickhire_phone(text)','EXECUTE')
     OR public.normalize_quickhire_phone('+91 98765-00003')
        IS DISTINCT FROM public.normalize_quickhire_phone('9876500003') THEN
    RAISE EXCEPTION 'Phone normalization must support Indian country-code inputs and remain internal-only';
  END IF;

  IF has_function_privilege('anon','public.claim_assisted_worker_profile(uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.claim_assisted_worker_profile(uuid,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.get_claimable_assisted_profiles()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_claimable_assisted_profiles()','EXECUTE')
     OR has_function_privilege('anon','public.set_assisted_profile_claim_secret(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.set_assisted_profile_claim_secret(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Claim RPC execution privileges are incorrect';
  END IF;

  SELECT pg_get_functiondef('public.get_claimed_profile_ids(uuid)'::regprocedure) INTO v_helper_def;
  IF v_helper_def NOT ILIKE '%auth.uid()%'
     OR v_helper_def NOT ILIKE '%is_admin%' THEN
    RAISE EXCEPTION 'Claimed-profile helper must restrict caller to self or administrator';
  END IF;

  SELECT pg_get_functiondef('public.claim_assisted_worker_profile(uuid,text,text)'::regprocedure) INTO v_helper_def;
  IF v_helper_def ILIKE '%otp_and_contractor_confirmation%'
     OR v_helper_def NOT ILIKE '%otp_and_secret_token%'
     OR v_helper_def NOT ILIKE '%phone_confirmed_at%'
     OR v_helper_def NOT ILIKE '%secret_hash%'
     OR v_helper_def NOT ILIKE '%extensions.crypt%' THEN
    RAISE EXCEPTION 'Self-service claim must require a verified matching phone and one-time secret proof; caller-selected confirmation is forbidden';
  END IF;

  SELECT id INTO v_worker_id FROM public.profiles
  WHERE role::text='worker' AND COALESCE(is_assisted_profile,false)=false
  LIMIT 1;
  IF v_worker_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',v_worker_id::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    BEGIN
      PERFORM * FROM public.get_claimed_profile_ids(gen_random_uuid());
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied:=true;
    END;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'A signed-in worker must not enumerate another account''s claimed profiles';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND cmd='SELECT' AND qual IN ('true','(true)')
  ) THEN
    RAISE EXCEPTION 'Profiles must not retain a globally readable SELECT policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workers'
      AND cmd='SELECT' AND qual ILIKE '%claimed_by_profile_id%'
  ) THEN
    RAISE EXCEPTION 'Claimants must be able to read their linked worker profile details';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.public_worker_directory'::regclass
      AND COALESCE(c.reloptions::text,'') ILIKE '%security_invoker=false%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.public_profile_directory'::regclass
      AND COALESCE(c.reloptions::text,'') ILIKE '%security_invoker=false%'
  ) THEN
    RAISE EXCEPTION 'Allowlisted directory views must remain available after profile RLS is narrowed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('public_worker_directory','public_profile_directory')
      AND column_name IN ('phone_number','phone','email','bank_account_no','upi_id','address_line','date_of_birth')
  ) THEN
    RAISE EXCEPTION 'Public directory views must not expose direct contact or private profile fields';
  END IF;
END
$$;
