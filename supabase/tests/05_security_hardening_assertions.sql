-- QuickHire security hardening verification assertions.
-- Run only against a staging database after applying
-- 20261123090000_security_hardening.sql.

DO $$
DECLARE
  v_role_trigger text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_select_owner_assisted_admin'
  ) THEN
    RAISE EXCEPTION 'Missing owner/admin-only profiles SELECT policy';
  END IF;

  IF has_column_privilege('authenticated', 'public.profiles', 'bank_account_no', 'SELECT')
     OR has_column_privilege('authenticated', 'public.profiles', 'bank_ifsc', 'SELECT')
     OR has_column_privilege('authenticated', 'public.profiles', 'upi_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.profiles', 'date_of_birth', 'SELECT')
     OR has_column_privilege('authenticated', 'public.profiles', 'address_line', 'SELECT') THEN
    RAISE EXCEPTION 'Sensitive profile columns remain selectable by authenticated clients';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT') THEN
    RAISE EXCEPTION 'Expected public profile name column is not selectable';
  END IF;

  IF has_table_privilege('anon', 'public.public_profile_directory', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous role can read the public profile directory';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.public_profile_directory', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated role cannot read the public profile directory';
  END IF;

  IF has_table_privilege('authenticated', 'public.phone_otps', 'SELECT')
     OR has_table_privilege('authenticated', 'public.phone_otps', 'INSERT')
     OR has_table_privilege('anon', 'public.phone_otps', 'SELECT')
     OR has_table_privilege('anon', 'public.phone_otps', 'INSERT') THEN
    RAISE EXCEPTION 'Deprecated phone_otps table is still accessible to client roles';
  END IF;

  IF has_table_privilege('authenticated', 'public.payments', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated clients can directly insert payment rows';
  END IF;

  IF has_column_privilege('authenticated', 'public.job_records', 'job_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.job_records', 'worker_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated clients can change job application identity fields';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.job_records', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'Employer application status update privilege is missing';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Client roles can still create objects in exposed public schema';
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_role_trigger
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'protect_profile_admin_role';

  IF v_role_trigger IS NULL OR position('current_user NOT IN' IN v_role_trigger) > 0 THEN
    RAISE EXCEPTION 'Profile role protection function is missing or uses unsafe current_user authorization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_records'
      AND policyname = 'job_records_insert_worker_application_or_employer_hire'
  ) THEN
    RAISE EXCEPTION 'Missing worker application / employer direct-hire INSERT policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'jobs_insert_active_employer'
  ) THEN
    RAISE EXCEPTION 'Missing active-employer-only job creation policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_records'
      AND policyname = 'rental_records_select_participants_admin'
  ) THEN
    RAISE EXCEPTION 'Missing participant-only rental record SELECT policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reviews'
      AND policyname = 'reviews_insert_job_participant'
  ) THEN
    RAISE EXCEPTION 'Missing job-participant review INSERT policy';
  END IF;

  RAISE NOTICE 'QuickHire security hardening assertions passed.';
END;
$$;
