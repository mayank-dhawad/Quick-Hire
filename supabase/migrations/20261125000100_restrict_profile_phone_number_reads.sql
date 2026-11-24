-- Keep worker contact numbers out of the shared profile directory.
-- Legitimate contact access is mediated by get_worker_contact_phone(), which
-- enforces active-account, employer/job relationship, assisted-profile and
-- administrator checks and applies the existing contact rate limit.
BEGIN;

REVOKE SELECT (phone_number, phone)
  ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.profiles.phone_number IS
  'Private contact number. Do not grant direct SELECT to application roles; use the authorized get_worker_contact_phone RPC.';

COMMIT;
