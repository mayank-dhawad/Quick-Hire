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
  IF NEW.can_manage_rentals IS DISTINCT FROM OLD.can_manage_rentals
     AND NOT COALESCE(public.is_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Only an authorized QuickHire administrator can grant or revoke rental-provider access.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_self_grant_rental_management ON public.profiles;
CREATE TRIGGER trg_prevent_self_grant_rental_management
BEFORE UPDATE OF can_manage_rentals ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_grant_rental_management();

CREATE OR REPLACE FUNCTION public.set_rental_provider_permission(
  p_user_id uuid,
  p_can_manage boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Administrator permission is required to manage rental-provider access.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET can_manage_rentals = p_can_manage,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QuickHire profile not found for rental-provider permission update.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_rental_provider_permission(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rental_provider_permission(uuid, boolean) TO authenticated;

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
