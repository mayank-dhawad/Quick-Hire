-- QuickHire security hardening migration
-- Created on an isolated GitHub branch. Review and apply only after reconciling
-- the existing production schema/migration history.
--
-- This migration is additive/forward-only. It does not delete application data.
-- It intentionally does not restore the missing payment/admin feature migrations;
-- those must be reconciled and applied separately after schema preflight.

BEGIN;

-- Remove unnecessary ability for client roles to create objects in the exposed schema.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- 1. Fix the profile-role trigger.
-- SECURITY DEFINER changes current_user to the function owner, so current_user
-- must never be used to decide whether an API caller is trusted.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean := public.is_admin(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Normal signup may create worker/employer profiles, but never an admin.
    IF v_caller_id IS NOT NULL AND NOT v_is_admin AND NEW.role = 'admin' THEN
      NEW.role := 'worker';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- A user cannot change their own role (including worker -> employer).
    -- Only an identity in admin_users may change an existing role through the API.
    IF v_caller_id IS NOT NULL
       AND NOT v_is_admin
       AND NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_admin_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_admin_role() TO service_role;

-- 2. Restrict profile rows to the owner, assisted-profile creator, or admin.
-- Public worker discovery remains available through the sanitized directory view.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read of active profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_owner_assisted_admin" ON public.profiles;
CREATE POLICY "profiles_select_owner_assisted_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (is_assisted_profile = true AND created_by = (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "profiles_insert_owner_assisted_admin" ON public.profiles;
CREATE POLICY "profiles_insert_owner_assisted_admin"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = id
    OR (is_assisted_profile = true AND created_by = (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "profiles_update_owner_assisted_admin" ON public.profiles;
CREATE POLICY "profiles_update_owner_assisted_admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (is_assisted_profile = true AND created_by = (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = id
    OR (is_assisted_profile = true AND created_by = (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

-- Column-level SELECT prevents accidental exposure of bank, UPI, DOB, and address
-- columns through a broad profiles SELECT. phone_number remains available only
-- for rows permitted by the owner/admin RLS policy above.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, role, full_name, phone_number, email, is_assisted_profile, created_by,
  created_at, updated_at, account_status, village, city, district, state, pincode,
  gender, category, skills, experience_years, availability_status,
  preferred_work_location, daily_wage, location, latitude, longitude,
  geocoded_address
) ON TABLE public.profiles TO authenticated;

-- A deliberately limited public profile view for equipment owner display.
CREATE OR REPLACE VIEW public.public_profile_directory
WITH (security_barrier = true)
AS
SELECT id, full_name, role, location, village, city, district, state
FROM public.profiles
WHERE account_status IS NULL OR account_status = 'active';

REVOKE ALL ON public.public_profile_directory FROM PUBLIC, anon;
GRANT SELECT ON public.public_profile_directory TO authenticated;

-- The existing public_worker_directory view is the supported public worker
-- discovery surface. It deliberately omits contact and financial information.
REVOKE ALL ON public.public_worker_directory FROM PUBLIC, anon;
GRANT SELECT ON public.public_worker_directory TO authenticated;

-- 3. Job applications: worker may apply as themselves; only the job owner/admin
-- may update application status. Identity columns are not client-updatable.
DROP POLICY IF EXISTS "Authenticated users can insert job records" ON public.job_records;
DROP POLICY IF EXISTS "Job records are viewable by authenticated users" ON public.job_records;
DROP POLICY IF EXISTS "Users can update job records" ON public.job_records;
DROP POLICY IF EXISTS "Job records read policy" ON public.job_records;
DROP POLICY IF EXISTS "Job records insert policy" ON public.job_records;
DROP POLICY IF EXISTS "Job records update policy" ON public.job_records;
DROP POLICY IF EXISTS "Participants can view job records" ON public.job_records;
DROP POLICY IF EXISTS "Workers can apply for jobs" ON public.job_records;
DROP POLICY IF EXISTS "Employers can update applicant status" ON public.job_records;

ALTER TABLE public.job_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_records_select_participants_admin" ON public.job_records;
CREATE POLICY "job_records_select_participants_admin"
  ON public.job_records FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = worker_id
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "job_records_insert_worker_application_or_employer_hire" ON public.job_records;
CREATE POLICY "job_records_insert_worker_application_or_employer_hire"
  ON public.job_records FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR (
      -- Worker self-application to an open job.
      worker_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'worker'::public.user_role
          AND (p.account_status IS NULL OR p.account_status = 'active')
      )
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = job_records.job_id AND j.status::text = 'open'
      )
    )
    OR (
      -- Employer direct hire: only for a job owned by this employer and a real,
      -- active worker profile. Supports the direct phone-hire workflow.
      EXISTS (
        SELECT 1 FROM public.jobs j
        JOIN public.profiles employer_profile ON employer_profile.id = j.employer_id
        WHERE j.id = job_records.job_id
          AND j.employer_id = (SELECT auth.uid())
          AND employer_profile.role = 'employer'::public.user_role
          AND (employer_profile.account_status IS NULL OR employer_profile.account_status = 'active')
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles worker_profile
        WHERE worker_profile.id = job_records.worker_id
          AND worker_profile.role = 'worker'::public.user_role
          AND (worker_profile.account_status IS NULL OR worker_profile.account_status = 'active')
      )
    )
  );

DROP POLICY IF EXISTS "job_records_update_employer_admin" ON public.job_records;
CREATE POLICY "job_records_update_employer_admin"
  ON public.job_records FOR UPDATE TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_records.job_id AND j.employer_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.job_records FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON TABLE public.job_records FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.job_records TO authenticated;
GRANT UPDATE (status) ON TABLE public.job_records TO authenticated;

-- Jobs are public to browse, but only active employers may create or manage them.
DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employers can update their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employers can delete their own jobs" ON public.jobs;

DROP POLICY IF EXISTS "jobs_insert_active_employer" ON public.jobs;
CREATE POLICY "jobs_insert_active_employer"
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (
    employer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'employer'::public.user_role
        AND (p.account_status IS NULL OR p.account_status = 'active')
    )
  );

DROP POLICY IF EXISTS "jobs_update_owner_or_admin" ON public.jobs;
CREATE POLICY "jobs_update_owner_or_admin"
  ON public.jobs FOR UPDATE TO authenticated
  USING (employer_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (employer_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "jobs_delete_owner_or_admin" ON public.jobs;
CREATE POLICY "jobs_delete_owner_or_admin"
  ON public.jobs FOR DELETE TO authenticated
  USING (employer_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

-- 4. Rental records: only the borrower, equipment owner, or admin can read.
DROP POLICY IF EXISTS "Rental records viewable by involved users" ON public.rental_records;
DROP POLICY IF EXISTS "Users can insert rental inquiries" ON public.rental_records;

ALTER TABLE public.rental_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_records_select_participants_admin" ON public.rental_records;
CREATE POLICY "rental_records_select_participants_admin"
  ON public.rental_records FOR SELECT TO authenticated
  USING (
    borrower_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.equipment e
      WHERE e.id = rental_records.equipment_id AND e.owner_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "rental_records_insert_borrower" ON public.rental_records;
CREATE POLICY "rental_records_insert_borrower"
  ON public.rental_records FOR INSERT TO authenticated
  WITH CHECK (
    borrower_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.equipment e
      WHERE e.id = rental_records.equipment_id
    )
  );

REVOKE ALL ON TABLE public.rental_records FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON TABLE public.rental_records FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.rental_records TO authenticated;

-- 5. OTP table is deprecated and has no active frontend usage. Keep it inaccessible.
DROP POLICY IF EXISTS "Allow public otp management" ON public.phone_otps;
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.phone_otps FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.phone_otps TO service_role;

-- 6. Reviews: only participants in the associated job can create or edit a review.
DROP POLICY IF EXISTS "reviews_select_participants" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_job_participant" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_reviewer" ON public.reviews;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_participants" ON public.reviews;
CREATE POLICY "reviews_select_participants"
  ON public.reviews FOR SELECT TO authenticated
  USING (
    reviewer_profile_id = (SELECT auth.uid())
    OR reviewed_profile_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "reviews_insert_job_participant" ON public.reviews;
CREATE POLICY "reviews_insert_job_participant"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.job_records jr
      JOIN public.jobs j ON j.id = jr.job_id
      WHERE jr.job_id = reviews.job_id
        AND (
          (jr.worker_id = reviews.reviewed_profile_id AND j.employer_id = (SELECT auth.uid()))
          OR
          (jr.worker_id = (SELECT auth.uid()) AND j.employer_id = reviews.reviewed_profile_id)
        )
    )
  );

DROP POLICY IF EXISTS "reviews_update_reviewer" ON public.reviews;
CREATE POLICY "reviews_update_reviewer"
  ON public.reviews FOR UPDATE TO authenticated
  USING (
    reviewer_profile_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    reviewer_profile_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

REVOKE ALL ON TABLE public.reviews FROM PUBLIC, anon;
REVOKE UPDATE ON TABLE public.reviews FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.reviews TO authenticated;
GRANT UPDATE (rating, comment) ON TABLE public.reviews TO authenticated;

-- 7. User notifications are private to their recipient.
DROP POLICY IF EXISTS "notifications_select_owner" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_owner" ON public.notifications;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_owner" ON public.notifications;
CREATE POLICY "notifications_select_owner"
  ON public.notifications FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "notifications_update_owner" ON public.notifications;
CREATE POLICY "notifications_update_owner"
  ON public.notifications FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (profile_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;

-- 8. Payments must be recorded through the validated server-side RPC, not
-- fabricated by direct client inserts. Keep read access to involved parties.
DROP POLICY IF EXISTS "Authenticated users can log payments" ON public.payments;
DROP POLICY IF EXISTS "Payers can insert payments" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_update" ON public.payments;

CREATE POLICY "payments_admin_update"
  ON public.payments FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

REVOKE INSERT, DELETE ON TABLE public.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.payments TO authenticated;

-- 9. Explicitly limit privileged admin-management RPCs to authenticated users.
-- Their function bodies still enforce active super-admin authorization.
REVOKE ALL ON FUNCTION public.grant_admin_role(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_admin_role(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_admin_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_admin_role(uuid, text) TO authenticated, service_role;

COMMIT;
