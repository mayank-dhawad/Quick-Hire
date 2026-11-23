# QuickHire production hotfix — 2026-11-24

Project: `lskkanszwfonjxyhuojr`

These additive statements were applied directly to the production database after inspecting the live schema. They are recorded here for audit/reconciliation only. The production Supabase migration history was empty, so this file is deliberately outside `supabase/migrations` and must not be replayed as a fresh migration until a proper baseline is reconciled.

## 1. Job application agreement metadata

```sql
ALTER TABLE public.job_records
  ADD COLUMN IF NOT EXISTS hiring_source text DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS agreement_evidence_type text DEFAULT 'worker_application_and_employer_acceptance';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.job_records'::regclass AND conname = 'job_records_hiring_source_check') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_hiring_source_check
      CHECK (hiring_source IN ('application', 'direct_phone'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.job_records'::regclass AND conname = 'job_records_agreement_evidence_type_check') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_agreement_evidence_type_check
      CHECK (agreement_evidence_type IN (
        'worker_application_and_employer_acceptance',
        'employer_reported_verbal_agreement'
      ));
  END IF;
END $$;
```

## 2. Private bank details table

```sql
CREATE TABLE IF NOT EXISTS public.profile_private_details (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name text,
  bank_account_no text,
  bank_ifsc text,
  upi_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_private_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_details_owner_select ON public.profile_private_details;
CREATE POLICY private_details_owner_select
  ON public.profile_private_details FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS private_details_owner_insert ON public.profile_private_details;
CREATE POLICY private_details_owner_insert
  ON public.profile_private_details FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS private_details_owner_update ON public.profile_private_details;
CREATE POLICY private_details_owner_update
  ON public.profile_private_details FOR UPDATE TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

REVOKE ALL ON public.profile_private_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profile_private_details TO authenticated;

INSERT INTO public.profile_private_details (
  profile_id, bank_name, bank_account_no, bank_ifsc, upi_id, created_at, updated_at
)
SELECT
  p.id, p.bank_name, p.bank_account_no, p.bank_ifsc, p.upi_id,
  COALESCE(p.created_at, now()), now()
FROM public.profiles p
WHERE p.bank_name IS NOT NULL
   OR p.bank_account_no IS NOT NULL
   OR p.bank_ifsc IS NOT NULL
   OR p.upi_id IS NOT NULL
ON CONFLICT (profile_id) DO NOTHING;
```

## Post-apply verification

- Confirmed both `job_records` metadata columns exist.
- Confirmed `profile_private_details` exists and has owner-only RLS policies.
- Confirmed 2 legacy profiles with bank/UPI data were copied to 2 private-detail rows.
- Original `profiles` rows were not modified or deleted.
- Requested PostgREST schema cache reload with `NOTIFY pgrst, 'reload schema'`.

## Important security follow-up

Legacy bank/UPI columns remain on `public.profiles` and existing broad profile SELECT policy was not changed in this hotfix. Complete privacy hardening requires a separately reviewed frontend cutover and column-level privilege migration; do not describe legacy fields as fully protected yet.
