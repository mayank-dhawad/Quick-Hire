-- QuickHire: close the legacy custom OTP table after migration to Supabase Phone Auth.
-- The live database contains a differently named permissive policy than the older
-- deprecation migration expected. This forward-only migration removes that exact
-- policy and removes direct Data API privileges. It preserves the table and rows.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.phone_otps') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow public otp management" ON public.phone_otps;
    DROP POLICY IF EXISTS "Allow public insert to phone_otps" ON public.phone_otps;
    DROP POLICY IF EXISTS "Allow public select from phone_otps" ON public.phone_otps;
    DROP POLICY IF EXISTS "Allow public delete from phone_otps" ON public.phone_otps;
    ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
    REVOKE ALL PRIVILEGES ON TABLE public.phone_otps FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;
COMMIT;
