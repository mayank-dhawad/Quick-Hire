-- Rental inquiry records are visible only to the borrower, equipment owner,
-- or an administrator. The old USING (true) policy exposed every inquiry.
BEGIN;

DROP POLICY IF EXISTS "Rental records viewable by involved users" ON public.rental_records;

CREATE POLICY "Rental records viewable by involved users"
  ON public.rental_records
  FOR SELECT
  TO authenticated
  USING (
    borrower_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.equipment e
      WHERE e.id = rental_records.equipment_id
        AND e.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );

COMMIT;
