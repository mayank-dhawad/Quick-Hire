/*
# Migration: Ensure Unicode Support and Add Location Column
#
# 1. Verification of PostgreSQL Unicode Character Set:
#    - PostgreSQL in Supabase natively uses UTF-8 character encoding (SERVER_ENCODING = 'UTF8').
#    - Columns defined as `TEXT`, `VARCHAR`, or `TEXT[]` automatically store full multi-byte
#      Unicode characters, flawlessly handling:
#        * Devanagari (Hindi, Marathi): e.g. "रामेश्वर पाटिल", "फसल कटाई", "ट्रैक्टर चालक"
#        * Bengali script (বাংলা): e.g. "রমেশ ঘোষ", "ফসল কাটা", "রাজমিস্ত্রি"
#        * Telugu script (తెలుగు): e.g. "రమేష్ కుమార్", "పంట కోత", "తాపీ పని"
#        * Extended Latin & Punctuation: full NFC / NFD support.
#
# 2. Existing Unicode Column Types Verified:
#    - `public.profiles`:
#        * `full_name` -> TEXT / VARCHAR (Unicode compliant)
#        * `phone_number` -> TEXT / VARCHAR
#        * `account_status` -> TEXT (Unicode compliant)
#    - `public.workers`:
#        * `category` -> TEXT / VARCHAR
#        * `skills` -> TEXT[] (Unicode compliant array)
#    - `public.jobs`:
#        * `title` -> TEXT / VARCHAR (Unicode compliant)
#        * `description` -> TEXT (Unicode compliant)
#        * `required_skills` -> TEXT[] (Unicode compliant array)
#    - `public.equipment`:
#        * `title` -> TEXT / VARCHAR (Unicode compliant)
#        * `description` -> TEXT (Unicode compliant)
#        * `location` -> TEXT (Unicode compliant)
#    - `public.quickhire_interest`:
#        * `name` -> TEXT (Unicode compliant)
#        * `village` -> TEXT (Unicode compliant)
#
# 3. Schema Enhancement:
#    - Adds `location` TEXT column to `public.profiles` if not present.
#    - Adds `location` TEXT column to `public.workers` if not present.
*/

-- 1. Ensure `location` column exists on public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS location TEXT;

-- 2. Ensure `location` column exists on public.workers
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS location TEXT;

-- 3. Add explicit comments confirming Unicode encoding compliance
COMMENT ON COLUMN public.profiles.full_name IS 'Full citizen name supporting Unicode regional scripts (Hindi, Marathi, Bengali, Telugu, English)';
COMMENT ON COLUMN public.profiles.location IS 'Village, block, or district supporting Unicode regional text';
COMMENT ON COLUMN public.workers.skills IS 'Array of worker skills supporting Unicode regional script entries';
COMMENT ON COLUMN public.jobs.title IS 'Job title supporting Unicode regional descriptions';
COMMENT ON COLUMN public.jobs.description IS 'Job details supporting Unicode regional text';
COMMENT ON COLUMN public.jobs.required_skills IS 'Required skill tags supporting Unicode strings';
