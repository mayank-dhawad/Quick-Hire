/*
# Create QuickHire interest records

1. New Tables
- `quickhire_interest` stores role selections and contact details submitted from the public QuickHire entry flow.
- `id` uniquely identifies each submission.
- `role` stores whether the person wants work or workers.
- `name`, `phone`, and `village` store the minimal follow-up details.
- `created_at` records when the submission was made.

2. Security
- Row level security is enabled.
- Anonymous and authenticated visitors can create submissions and read the shared confirmation feed needed by this public landing experience.
- Update and delete are allowed for the shared single-tenant prototype so the app remains functional without a sign-in screen.

3. Notes
- This table intentionally does not store identity documents or sensitive personal identifiers.
*/

CREATE TABLE IF NOT EXISTS public.quickhire_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('worker', 'employer')),
  name text NOT NULL,
  phone text NOT NULL,
  village text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quickhire_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can read QuickHire interest"
  ON public.quickhire_interest FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can create QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can create QuickHire interest"
  ON public.quickhire_interest FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can update QuickHire interest"
  ON public.quickhire_interest FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete QuickHire interest" ON public.quickhire_interest;
CREATE POLICY "Public can delete QuickHire interest"
  ON public.quickhire_interest FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS quickhire_interest_created_at_idx
  ON public.quickhire_interest (created_at DESC);
