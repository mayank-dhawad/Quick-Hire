-- Reconcile production access for worker reviews and account notifications.
-- Public review reads are intentional; writes are limited to the employer who
-- completed the job and hired the reviewed worker. User notifications are owner-only.
BEGIN;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
CREATE POLICY notifications_owner_select
  ON public.notifications FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
CREATE INDEX IF NOT EXISTS idx_notifications_profile_created
  ON public.notifications (profile_id, created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reviews'::regclass
      AND conname = 'reviews_unique_job_reviewer_reviewed'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_unique_job_reviewer_reviewed
      UNIQUE (job_id, reviewer_profile_id, reviewed_profile_id);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_profile ON public.reviews (reviewed_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_job_id ON public.reviews (job_id);

DROP POLICY IF EXISTS reviews_select_policy ON public.reviews;
CREATE POLICY reviews_select_policy ON public.reviews
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS reviews_insert_policy ON public.reviews;
CREATE POLICY reviews_insert_policy ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_profile_id = (SELECT auth.uid())
    AND job_id IS NOT NULL
    AND rating IS NOT NULL
    AND rating BETWEEN 1 AND 5
    AND EXISTS (
      SELECT 1 FROM public.jobs AS j
      JOIN public.job_records AS jr ON jr.job_id = j.id
      WHERE j.id = reviews.job_id
        AND j.employer_id = (SELECT auth.uid())
        AND j.status::text = 'completed'
        AND jr.worker_id = reviews.reviewed_profile_id
        AND jr.status IN ('hired', 'completed')
    )
  );

DROP POLICY IF EXISTS reviews_update_policy ON public.reviews;
CREATE POLICY reviews_update_policy ON public.reviews
  FOR UPDATE TO authenticated
  USING (
    reviewer_profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs AS j
      JOIN public.job_records AS jr ON jr.job_id = j.id
      WHERE j.id = reviews.job_id
        AND j.employer_id = (SELECT auth.uid())
        AND j.status::text = 'completed'
        AND jr.worker_id = reviews.reviewed_profile_id
        AND jr.status IN ('hired', 'completed')
    )
  )
  WITH CHECK (
    reviewer_profile_id = (SELECT auth.uid())
    AND job_id IS NOT NULL
    AND rating IS NOT NULL
    AND rating BETWEEN 1 AND 5
    AND EXISTS (
      SELECT 1 FROM public.jobs AS j
      JOIN public.job_records AS jr ON jr.job_id = j.id
      WHERE j.id = reviews.job_id
        AND j.employer_id = (SELECT auth.uid())
        AND j.status::text = 'completed'
        AND jr.worker_id = reviews.reviewed_profile_id
        AND jr.status IN ('hired', 'completed')
    )
  );

REVOKE ALL ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_review_participant_reassignment()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.reviewer_profile_id IS DISTINCT FROM OLD.reviewer_profile_id
     OR NEW.reviewed_profile_id IS DISTINCT FROM OLD.reviewed_profile_id THEN
    RAISE EXCEPTION 'Review job and participant fields cannot be changed.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_prevent_review_participant_reassignment ON public.reviews;
CREATE TRIGGER trg_prevent_review_participant_reassignment
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.prevent_review_participant_reassignment();
REVOKE ALL ON FUNCTION public.prevent_review_participant_reassignment()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_worker_average_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_profile_id uuid;
  v_average numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_profile_id := OLD.reviewed_profile_id;
  ELSE
    v_profile_id := NEW.reviewed_profile_id;
  END IF;
  SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0)
    INTO v_average
  FROM public.reviews
  WHERE reviewed_profile_id = v_profile_id;
  UPDATE public.workers
  SET average_rating = v_average, updated_at = now()
  WHERE id = v_profile_id;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS trg_recalculate_worker_rating ON public.reviews;
CREATE TRIGGER trg_recalculate_worker_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_worker_average_rating();
REVOKE ALL ON FUNCTION public.recalculate_worker_average_rating()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.worker_contact_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.worker_contact_rate_limits FROM PUBLIC, anon, authenticated;
COMMIT;
