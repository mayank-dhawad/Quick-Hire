-- Production parity checks for payment/audit and complaints features.
DO $$
DECLARE
  v_policy_count integer;
  v_rls_enabled boolean;
BEGIN
  IF to_regclass('public.payment_audit_events') IS NULL THEN
    RAISE EXCEPTION 'payment_audit_events table is missing';
  END IF;

  IF to_regclass('public.complaints') IS NULL THEN
    RAISE EXCEPTION 'complaints table is missing';
  END IF;

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE oid = 'public.payment_audit_events'::regclass;
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'payment_audit_events RLS must be enabled';
  END IF;

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE oid = 'public.complaints'::regclass;
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'complaints RLS must be enabled';
  END IF;

  IF NOT has_table_privilege('authenticated','public.payment_audit_events','SELECT') THEN
    RAISE EXCEPTION 'Authenticated users must be able to read permitted payment audit history';
  END IF;
  IF has_table_privilege('authenticated','public.payment_audit_events','INSERT')
     OR has_table_privilege('authenticated','public.payment_audit_events','UPDATE')
     OR has_table_privilege('authenticated','public.payment_audit_events','DELETE') THEN
    RAISE EXCEPTION 'Authenticated users must not mutate immutable payment audit events directly';
  END IF;
  IF has_table_privilege('anon','public.payment_audit_events','SELECT') THEN
    RAISE EXCEPTION 'Anonymous users must not read payment audit events';
  END IF;

  IF NOT has_table_privilege('authenticated','public.complaints','SELECT')
     OR NOT has_table_privilege('authenticated','public.complaints','INSERT')
     OR NOT has_table_privilege('authenticated','public.complaints','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated admin session requires complaint case read/write grants';
  END IF;
  IF has_table_privilege('authenticated','public.complaints','DELETE')
     OR has_table_privilege('anon','public.complaints','SELECT') THEN
    RAISE EXCEPTION 'Complaint deletion and anonymous complaint access must remain disabled';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename='complaints'
    AND cmd='ALL' AND qual ILIKE '%is_admin%';
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION 'Complaints must have exactly one admin-only ALL policy';
  END IF;

  IF to_regprocedure('public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'record_direct_payment RPC is missing';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.record_direct_payment(text,uuid,uuid,uuid,numeric,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must be able to call the validated direct-payment RPC';
  END IF;
  IF to_regprocedure('public.reconcile_payment_admin(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_payment_admin RPC is missing';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename='job_records' AND cmd='SELECT'
    AND qual NOT ILIKE '%true%';
  IF v_policy_count = 0 THEN
    RAISE EXCEPTION 'job_records must have participant-scoped read access';
  END IF;
END
$$;
