-- Ensure payment RPCs are authenticated-only and trigger helpers are not
-- exposed as callable API functions.
DO $$
DECLARE
  v_signature text;
  v_index_count integer;
  v_trigger_functions text[] := ARRAY[
    'public.check_job_worker_capacity()',
    'public.check_payment_status_authorization()',
    'public.get_validated_caller_context()',
    'public.log_payment_audit_event()',
    'public.sync_assignment_payment_ledger()',
    'public.validate_job_record_transition()',
    'public.validate_payment_integrity_and_limits()',
    'public.prevent_payment_deletion()',
    'public.prevent_audit_tampering()'
  ];
BEGIN
  -- Regression guard: jobs has one public SELECT policy, not a duplicate
  -- authenticated policy that is automatically included by the public role.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='jobs'
      AND policyname='Jobs are viewable by authenticated users'
  ) THEN
    RAISE EXCEPTION 'Redundant authenticated jobs SELECT policy remains';
  END IF;

  SELECT count(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname='public'
    AND indexname = ANY (ARRAY[
      'idx_admin_audit_logs_admin_id','idx_equipment_owner_id',
      'idx_job_records_arrived_reported_by','idx_job_records_attendance_confirmed_by',
      'idx_job_records_cancelled_by','idx_job_records_reported_by','idx_job_records_worker_id',
      'idx_jobs_cancelled_by','idx_jobs_employer_id','idx_notifications_profile_id',
      'idx_payments_payee_id','idx_payments_payer_id','idx_payments_recorded_by',
      'idx_payments_verified_by','idx_profiles_created_by',
      'idx_rental_records_borrower_id','idx_rental_records_equipment_id',
      'idx_reviews_reviewed_profile_id','idx_reviews_reviewer_profile_id'
    ]);
  IF v_index_count <> 19 THEN
    RAISE EXCEPTION 'Expected 19 foreign-key support indexes, found %', v_index_count;
  END IF;

  -- Client roles must never be able to create objects in the exposed schema.
  -- This protects SECURITY DEFINER routines from public-schema object shadowing.
  IF has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Client roles must not have CREATE privilege on schema public';
  END IF;

  FOREACH v_signature IN ARRAY v_trigger_functions LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Internal trigger/helper function is still directly executable: %', v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('anon',
    'public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not call record_direct_payment';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must retain record_direct_payment RPC access';
  END IF;

  IF has_function_privilege('anon',
    'public.reconcile_payment_admin(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not call reconcile_payment_admin';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.reconcile_payment_admin(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must retain admin reconciliation RPC access';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.prevent_payment_deletion()'::regprocedure
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'prevent_payment_deletion must use a fixed search_path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.prevent_audit_tampering()'::regprocedure
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'prevent_audit_tampering must use a fixed search_path';
  END IF;
END
$$;
