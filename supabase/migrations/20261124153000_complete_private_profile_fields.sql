-- QuickHire: complete private profile fields on databases where the table
-- was created before the full private-profile migration was applied.
-- Additive and repeat-safe. Does not remove legacy columns or change profiles grants.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profile_private_details') IS NULL THEN
    RAISE EXCEPTION 'Required table public.profile_private_details is missing; reconcile the base schema before applying this migration.';
  END IF;
END
$$;

ALTER TABLE public.profile_private_details
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

-- Preserve any destination value already entered by the account owner.
-- Only fill missing private values from the legacy profiles columns.
INSERT INTO public.profile_private_details (
  profile_id,
  date_of_birth,
  address_line,
  updated_at
)
SELECT
  p.id,
  p.date_of_birth,
  p.address_line,
  now()
FROM public.profiles AS p
WHERE p.date_of_birth IS NOT NULL
   OR p.address_line IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE
SET
  date_of_birth = COALESCE(
    public.profile_private_details.date_of_birth,
    EXCLUDED.date_of_birth
  ),
  address_line = COALESCE(
    public.profile_private_details.address_line,
    EXCLUDED.address_line
  ),
  updated_at = now();

-- Private profile rows remain owner-only. Do not grant facilitator access
-- to banking, identity, residential or emergency details through this table.
ALTER TABLE public.profile_private_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_details_owner_select ON public.profile_private_details;
CREATE POLICY private_details_owner_select
  ON public.profile_private_details
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS private_details_owner_insert ON public.profile_private_details;
CREATE POLICY private_details_owner_insert
  ON public.profile_private_details
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS private_details_owner_update ON public.profile_private_details;
CREATE POLICY private_details_owner_update
  ON public.profile_private_details
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = profile_id)
  WITH CHECK ((SELECT auth.uid()) = profile_id);

REVOKE ALL ON TABLE public.profile_private_details FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile_private_details TO authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.profile_private_details FROM authenticated;

COMMENT ON COLUMN public.profile_private_details.date_of_birth IS
  'Private date of birth; readable and writable only by the profile owner.';
COMMENT ON COLUMN public.profile_private_details.address_line IS
  'Private residential street address; readable and writable only by the profile owner.';
COMMENT ON COLUMN public.profile_private_details.emergency_contact_name IS
  'Private emergency contact name; readable and writable only by the profile owner.';
COMMENT ON COLUMN public.profile_private_details.emergency_contact_phone IS
  'Private emergency contact phone; readable and writable only by the profile owner.';

COMMIT;
