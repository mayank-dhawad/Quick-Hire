-- Migration: 20261026120000_worker_ratings_and_rehire_history.sql
-- Description:
-- 1. Adds unique constraint to public.reviews (job_id, reviewer_profile_id, reviewed_profile_id)
--    to prevent duplicate reviews for the same completed job.
-- 2. Tightens RLS policy on public.reviews:
--    - Employers can only rate a worker when:
--      a) auth.uid() = reviewer_profile_id
--      b) A genuine job exists where employer_id = auth.uid() and job.status = 'completed'
--      c) A job_record exists for (job_id, worker_id) where status = 'hired' (or completed job participant)
--    - Employers can update their own review (rating and comment) for their reviewed jobs.
-- 3. Creates an automated trigger to maintain public.workers.average_rating whenever reviews are inserted, updated, or deleted.
-- 4. Exposes a public safe function / trigger calculation that keeps average_rating synced from real reviews.

-- Step 1: Ensure unique constraint so an employer cannot post duplicate reviews for the same job & worker
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'reviews_unique_job_reviewer_reviewed'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_unique_job_reviewer_reviewed
      UNIQUE (job_id, reviewer_profile_id, reviewed_profile_id);
  END IF;
END $$;

-- Step 2: Index for performance
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_profile ON public.reviews(reviewed_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_job_id ON public.reviews(job_id);

-- Step 3: Trigger function to recalculate worker average_rating accurately from real reviews
CREATE OR REPLACE FUNCTION public.recalculate_worker_average_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_target_profile_id uuid;
  v_avg numeric;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_target_profile_id := OLD.reviewed_profile_id;
  ELSE
    v_target_profile_id := NEW.reviewed_profile_id;
  END IF;

  -- Calculate average rating rounded to 1 decimal place
  SELECT ROUND(AVG(rating)::numeric, 1)
  INTO v_avg
  FROM public.reviews
  WHERE reviewed_profile_id = v_target_profile_id;

  -- If no reviews remain, default to 5.0 or null
  UPDATE public.workers
  SET average_rating = COALESCE(v_avg, 5.0)
  WHERE id = v_target_profile_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_recalculate_worker_rating ON public.reviews;
CREATE TRIGGER trg_recalculate_worker_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_worker_average_rating();

-- Step 4: RLS Policies on public.reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 4.1 SELECT Policy: Public/Authenticated can read ratings and comments (contains no sensitive bank/phone data)
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "reviews_select_policy" ON public.reviews;
CREATE POLICY "reviews_select_policy"
  ON public.reviews
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4.2 INSERT Policy: Only authorized employers who completed a job with the worker
DROP POLICY IF EXISTS "Authenticated users can submit reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_policy" ON public.reviews;
CREATE POLICY "reviews_insert_policy"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_profile_id
    AND (
      -- Verify genuine job relationship with completed status
      EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.job_records jr ON jr.job_id = j.id
        WHERE j.id = reviews.job_id
          AND j.employer_id = auth.uid()
          AND j.status = 'completed'
          AND jr.worker_id = reviews.reviewed_profile_id
          AND jr.status IN ('hired', 'completed')
      )
      OR public.is_admin(auth.uid())
    )
  );

-- 4.3 UPDATE Policy: Reviewers can update their own review rating or comment
DROP POLICY IF EXISTS "reviews_update_policy" ON public.reviews;
CREATE POLICY "reviews_update_policy"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = reviewer_profile_id
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = reviewer_profile_id
    OR public.is_admin(auth.uid())
  );
