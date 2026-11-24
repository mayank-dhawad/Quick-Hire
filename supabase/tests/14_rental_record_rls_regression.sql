-- Rental inquiries must not be globally readable by authenticated users.
DO $$
DECLARE
  v_qual text;
  v_rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE oid='public.rental_records'::regclass;
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'rental_records RLS must remain enabled';
  END IF;

  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname='public' AND tablename='rental_records'
    AND cmd='SELECT' AND policyname='Rental records viewable by involved users';

  IF v_qual IS NULL
     OR v_qual ILIKE '%true%'
     OR v_qual NOT ILIKE '%borrower_id%'
     OR v_qual NOT ILIKE '%equipment%'
     OR v_qual NOT ILIKE '%is_admin%' THEN
    RAISE EXCEPTION 'Rental SELECT policy must restrict access to borrower, equipment owner and admin';
  END IF;
END
$$;
