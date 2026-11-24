-- The legacy dual-write trigger must not be able to delete owner-managed
-- private details when ordinary profile fields are updated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='trg_sync_legacy_profile_private_details'
      AND tgrelid='public.profiles'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Legacy private-profile synchronization trigger must be removed';
  END IF;

  IF to_regprocedure('public.sync_legacy_profile_private_details()') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy private-profile synchronization function must be removed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profile_private_details'
      AND policyname='private_details_owner_select'
      AND qual ILIKE '%auth.uid%'
      AND qual NOT ILIKE '%is_admin%'
  ) THEN
    RAISE EXCEPTION 'Private profile details must retain owner-only SELECT policy';
  END IF;
END
$$;
