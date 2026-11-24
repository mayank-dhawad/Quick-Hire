-- Remove the transitional dual-write trigger that mirrored legacy private
-- columns on profiles. The current application writes private fields directly
-- to profile_private_details; this trigger could delete those rows on unrelated
-- profile updates when legacy columns are NULL.
BEGIN;

DROP TRIGGER IF EXISTS trg_sync_legacy_profile_private_details ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_legacy_profile_private_details();

COMMIT;
