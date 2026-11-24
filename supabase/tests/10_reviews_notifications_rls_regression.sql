-- Regression tests for notification/review RLS and internal contact tables.
DO $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notifications'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on notifications';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND policyname = 'notifications_owner_select' AND cmd = 'SELECT'
      AND roles @> ARRAY['authenticated']::name[] AND qual LIKE '%auth.uid%'
  ) THEN
    RAISE EXCEPTION 'Owner-only notification SELECT policy is missing';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.notifications', 'SELECT')
     OR has_table_privilege('anon', 'public.notifications', 'SELECT')
     OR has_table_privilege('authenticated', 'public.notifications', 'INSERT') THEN
    RAISE EXCEPTION 'Unexpected notification table privileges';
  END IF;
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'reviews'
    AND policyname IN ('reviews_select_policy', 'reviews_insert_policy', 'reviews_update_policy');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 controlled review policies, found %', v_count;
  END IF;
  IF NOT has_table_privilege('anon', 'public.reviews', 'SELECT')
     OR has_table_privilege('anon', 'public.reviews', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.reviews', 'INSERT')
     OR has_table_privilege('authenticated', 'public.reviews', 'DELETE') THEN
    RAISE EXCEPTION 'Unexpected review table privileges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recalculate_worker_rating' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_review_participant_reassignment' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Review integrity triggers are missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.worker_contact_logs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.worker_contact_rate_limits', 'SELECT')
     OR has_table_privilege('anon', 'public.worker_contact_logs', 'SELECT')
     OR has_table_privilege('anon', 'public.worker_contact_rate_limits', 'SELECT') THEN
    RAISE EXCEPTION 'Internal worker contact tables must not be directly readable';
  END IF;
  RAISE NOTICE 'Notification, review, and contact-table RLS checks passed.';
END
$$;
