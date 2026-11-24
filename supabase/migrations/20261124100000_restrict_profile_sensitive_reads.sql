-- Restrict direct profile reads to non-sensitive directory and workflow fields.
-- Bank, DOB and residential address are stored in profile_private_details.
BEGIN;

REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  role,
  full_name,
  phone_number,
  is_assisted_profile,
  created_by,
  created_at,
  updated_at,
  account_status,
  email,
  village,
  city,
  district,
  state,
  pincode,
  gender,
  category,
  skills,
  experience_years,
  experience_description,
  availability_status,
  preferred_work_location,
  daily_wage,
  location,
  latitude,
  longitude,
  geocoded_address
) ON TABLE public.profiles TO authenticated;

COMMENT ON TABLE public.profiles IS
  'Profile directory and workflow fields only. Banking, date of birth and residential address must be read from profile_private_details under owner-only RLS.';

COMMIT;
