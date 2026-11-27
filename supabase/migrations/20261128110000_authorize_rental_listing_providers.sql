-- Rental publishing is a separately approved capability, not an automatic employer/worker role.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_manage_rentals boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_manage_rentals IS
  'Admin-approved capability to publish and manage equipment/rental listings. Independent of the worker/employer account role.';

CREATE OR REPLACE FUNCTION public.prevent_self_grant_rental_management()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.can_manage_rentals IS TRUE)
    OR (
      TG_OP = 'UPDATE'
      AND NEW.can_manage_rentals IS DISTINCT FROM OLD.can_manage_rentals
    )
  ) AND NOT COALESCE(public.is_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Only an authorized QuickHire administrator can grant or revoke rental-provider access.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_self_grant_rental_management ON public.profiles;
CREATE TRIGGER trg_prevent_self_grant_rental_management
BEFORE INSERT OR UPDATE OF can_manage_rentals ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_grant_rental_management();

DROP POLICY IF EXISTS "Admins can manage rental provider permissions" ON public.profiles;
CREATE POLICY "Admins can manage rental provider permissions"
ON public.profiles
FOR UPDATE
TO authenticated
USING (COALESCE(public.is_admin(auth.uid()), false))
WITH CHECK (COALESCE(public.is_admin(auth.uid()), false));

DROP POLICY IF EXISTS "Users can insert their own equipment" ON public.equipment;
CREATE POLICY "Approved rental providers can insert equipment"
ON public.equipment
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND (
    COALESCE(public.is_admin(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.can_manage_rentals = true
    )
  )
);

DROP POLICY IF EXISTS "Owners can update their own equipment" ON public.equipment;
CREATE POLICY "Approved rental providers can update equipment"
ON public.equipment
FOR UPDATE
TO authenticated
USING (
  COALESCE(public.is_admin(auth.uid()), false)
  OR (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.can_manage_rentals = true
    )
  )
)
WITH CHECK (
  COALESCE(public.is_admin(auth.uid()), false)
  OR (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.can_manage_rentals = true
    )
  )
);

DROP POLICY IF EXISTS "Owners can delete their own equipment" ON public.equipment;
CREATE POLICY "Approved rental providers can delete equipment"
ON public.equipment
FOR DELETE
TO authenticated
USING (
  COALESCE(public.is_admin(auth.uid()), false)
  OR (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.can_manage_rentals = true
    )
  )
);

COMMIT;
