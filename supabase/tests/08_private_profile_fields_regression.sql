-- Regression checks for the private profile field cutover.
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(required.column_name)
  INTO v_missing
  FROM (VALUES
    ('date_of_birth'),
    ('address_line'),
    ('emergency_contact_name'),
    ('emergency_contact_phone')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'profile_private_details'
      AND c.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'profile_private_details missing required columns: %', v_missing;
  END IF;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.profile_private_details'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS must be enabled on profile_private_details';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.profile_private_details', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.profile_private_details', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.profile_private_details', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated owners require SELECT, INSERT and UPDATE privileges';
  END IF;

  IF has_table_privilege('anon', 'public.profile_private_details', 'SELECT')
     OR has_table_privilege('anon', 'public.profile_private_details', 'INSERT')
     OR has_table_privilege('anon', 'public.profile_private_details', 'UPDATE') THEN
    RAISE EXCEPTION 'Anonymous role must not access profile_private_details';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_private_details'
      AND policyname = 'private_details_owner_select'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles)
      AND qual ILIKE '%auth.uid()%profile_id%'
  ) THEN
    RAISE EXCEPTION 'Owner-only SELECT policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_private_details'
      AND policyname = 'private_details_owner_insert'
      AND cmd = 'INSERT'
      AND 'authenticated' = ANY(roles)
      AND with_check ILIKE '%auth.uid()%profile_id%'
  ) THEN
    RAISE EXCEPTION 'Owner-only INSERT policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_private_details'
      AND policyname = 'private_details_owner_update'
      AND cmd = 'UPDATE'
      AND 'authenticated' = ANY(roles)
      AND qual ILIKE '%auth.uid()%profile_id%'
      AND with_check ILIKE '%auth.uid()%profile_id%'
  ) THEN
    RAISE EXCEPTION 'Owner-only UPDATE policy is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.profile_private_details d ON d.profile_id = p.id
    WHERE (p.date_of_birth IS NOT NULL AND d.date_of_birth IS NULL)
       OR (p.address_line IS NOT NULL AND d.address_line IS NULL)
  ) THEN
    RAISE EXCEPTION 'Private profile backfill left legacy values unmigrated';
  END IF;
END
$$;
