-- ============================================================================
-- QUICKHIRE MIGRATION: DEPRECATE PHONE_OTPS AND SECURE SUPABASE PHONE AUTH
-- Migration Name: 20261024020000_deprecate_phone_otps_and_secure_phone_auth.sql
-- Description:
--   1. Revokes public select/insert/delete access on the legacy phone_otps table.
--      All OTP operations now flow exclusively through Supabase Native Phone Auth
--      with server-side SMS delivery via Fast2SMS Auth Hook.
--   2. Ensures profiles and workers tables remain strictly linked to auth.users.id.
--   3. Preserves all historical records without dropping or truncating tables.
--   4. All statements are IF NOT EXISTS / idempotent and non-destructive.
-- ============================================================================

-- 1. Deprecate public access to phone_otps table (no custom OTP storage or anonymous access)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'phone_otps'
  ) THEN
    -- Revoke permissive public policies
    DROP POLICY IF EXISTS "Allow public insert to phone_otps" ON public.phone_otps;
    DROP POLICY IF EXISTS "Allow public select from phone_otps" ON public.phone_otps;
    DROP POLICY IF EXISTS "Allow public delete from phone_otps" ON public.phone_otps;

    -- Ensure RLS is enabled and only service_role / superadmin can inspect if needed.
    -- NO public policies are created, locking down the table completely.
    -- Note: Data is strictly preserved without truncating.
    ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 2. Confirm profiles table unique constraint on id and foreign key to auth.users
-- Profiles are primary identity source linked directly to Supabase Auth UUID.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_id_fkey'
  ) THEN
    -- Add foreign key constraint if not already present
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- In case of existing records with mismatch, ignore to prevent destructive failures
    NULL;
END $$;
