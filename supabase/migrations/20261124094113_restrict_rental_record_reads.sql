-- Rental inquiry records are visible only to the borrower, equipment owner,
-- or an administrator. The old USING (true) policy exposed every inquiry.
--
-- The legacy table exists in production but was missing from the clean migration
-- chain. Create the minimal compatible schema so fresh environments can rebuild
-- the same security boundary instead of failing before this policy is installed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rental_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  borrower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text DEFAULT 'inquired',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rental_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_records FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.rental_records TO authenticated;

DROP POLICY IF EXISTS "Rental records viewable by involved users" ON public.rental_records;

CREATE POLICY "Rental records viewable by involved users"
  ON public.rental_records
  FOR SELECT
  TO authenticated
  USING (
    borrower_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.equipment e
      WHERE e.id = rental_records.equipment_id
        AND e.owner_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_rental_records_borrower_created
  ON public.rental_records (borrower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rental_records_equipment_created
  ON public.rental_records (equipment_id, created_at DESC);

COMMIT;
