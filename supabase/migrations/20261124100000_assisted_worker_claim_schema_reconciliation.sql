-- Reconcile assisted worker profiles for production and secure their history.
-- This migration is intentionally compatible with production, where the original
-- 20261108110000 migration was not recorded as applied.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS claimed_by_profile_id uuid;

-- Assisted worker profiles use independent UUIDs and may share the worker's
-- verified phone with the later authenticated account.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_number_key;
DROP INDEX IF EXISTS public.profiles_phone_number_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_created_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_claimed_by_profile_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_claimed_by_profile_id_fkey
  FOREIGN KEY (claimed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_phone_number_lookup
  ON public.profiles(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_claimed_by_profile_id
  ON public.profiles(claimed_by_profile_id) WHERE claimed_by_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.assisted_profile_claim_secrets (
  assisted_profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assisted_profile_claim_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assisted_profile_claim_secrets FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.assisted_profile_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assisted_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  claimed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  claim_status text NOT NULL DEFAULT 'pending_review'
    CHECK (claim_status IN ('pending_review','verified_and_claimed','rejected','revoked')),
  verification_method text NOT NULL
    CHECK (verification_method IN ('otp_and_contractor_confirmation','otp_and_secret_token','admin_verified')),
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assisted_profile_claims ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_assisted_claims_profile_created
  ON public.assisted_profile_claims(assisted_profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assisted_claims_claimant_created
  ON public.assisted_profile_claims(claimed_by_profile_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.is_active_profile(p_user_id uuid,p_required_role text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
SET row_security = off
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_user_id IS NULL THEN false
    WHEN p_user_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id=p_user_id
        AND p.account_status='active'
        AND (p_required_role IS NULL OR p.role::text=p_required_role)
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.get_claimed_profile_ids(p_user_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL
     OR (p_user_id <> auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'You may only inspect your own claimed profiles.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT p.id FROM public.profiles p
  WHERE p.claimed_by_profile_id=p_user_id AND p.is_assisted_profile IS TRUE;
END
$$;

CREATE OR REPLACE FUNCTION public.set_assisted_profile_claim_secret(
  p_assisted_profile_id uuid,
  p_secret text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,auth,extensions,pg_temp
SET row_security = off
AS $$
DECLARE v_caller uuid:=auth.uid(); v_assisted public.profiles%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  IF p_secret IS NULL OR length(p_secret)<20 OR p_secret ~ '[[:space:]]' THEN
    RAISE EXCEPTION 'Claim secret must contain at least 20 non-space characters.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_assisted FROM public.profiles WHERE id=p_assisted_profile_id FOR UPDATE;
  IF NOT FOUND OR v_assisted.is_assisted_profile IS NOT TRUE OR v_assisted.role::text<>'worker' THEN
    RAISE EXCEPTION 'Assisted worker profile not found.' USING ERRCODE='P0002';
  END IF;
  IF v_assisted.claimed_by_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'This assisted worker profile has already been claimed.' USING ERRCODE='55000';
  END IF;
  IF v_assisted.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Only the profile creator or an administrator may set its claim secret.' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.assisted_profile_claim_secrets(assisted_profile_id,secret_hash,created_by,created_at,updated_at)
  VALUES(p_assisted_profile_id,extensions.crypt(p_secret,extensions.gen_salt('bf')),v_caller,now(),now())
  ON CONFLICT(assisted_profile_id) DO UPDATE
    SET secret_hash=EXCLUDED.secret_hash,created_by=EXCLUDED.created_by,updated_at=now();
  RETURN jsonb_build_object('success',true,'assisted_profile_id',p_assisted_profile_id);
END
$$;

CREATE OR REPLACE FUNCTION public.claim_assisted_worker_profile(
  p_assisted_profile_id uuid,
  p_verification_method text,
  p_verification_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,auth,extensions,pg_temp
SET row_security = off
AS $$
DECLARE
  v_caller uuid:=auth.uid();
  v_worker public.profiles%ROWTYPE;
  v_assisted public.profiles%ROWTYPE;
  v_auth_phone text;
  v_phone_confirmed_at timestamptz;
  v_phone_matches boolean:=false;
  v_secret_hash text;
  v_secret_valid boolean:=false;
  v_recent_failures integer;
  v_claim_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  IF p_verification_method IS DISTINCT FROM 'otp_and_secret_token' THEN
    RAISE EXCEPTION 'Unsupported claim verification method.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_worker FROM public.profiles WHERE id=v_caller;
  IF NOT FOUND OR v_worker.role::text<>'worker' OR v_worker.account_status<>'active' THEN
    RAISE EXCEPTION 'An active worker account is required.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_assisted FROM public.profiles WHERE id=p_assisted_profile_id FOR UPDATE;
  IF NOT FOUND OR v_assisted.is_assisted_profile IS NOT TRUE
     OR v_assisted.role::text<>'worker' OR v_assisted.account_status<>'active' THEN
    RAISE EXCEPTION 'Active assisted worker profile not found.' USING ERRCODE='P0002';
  END IF;
  IF v_assisted.claimed_by_profile_id=v_caller THEN
    RETURN jsonb_build_object('success',true,'already_claimed',true,'profile_id',p_assisted_profile_id);
  ELSIF v_assisted.claimed_by_profile_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'message','This profile has already been claimed.');
  END IF;

  SELECT count(*) INTO v_recent_failures
  FROM public.assisted_profile_claims c
  WHERE c.assisted_profile_id=p_assisted_profile_id
    AND c.claimed_by_profile_id=v_caller
    AND c.claim_status='rejected'
    AND c.created_at>now()-interval '15 minutes';
  IF v_recent_failures>=5 THEN
    RAISE EXCEPTION 'Too many unsuccessful attempts. Please try again later.' USING ERRCODE='P0001';
  END IF;

  SELECT u.phone,u.phone_confirmed_at INTO v_auth_phone,v_phone_confirmed_at
  FROM auth.users u WHERE u.id=v_caller;
  v_phone_matches:=v_phone_confirmed_at IS NOT NULL
    AND NULLIF(regexp_replace(COALESCE(v_auth_phone,''),'[^0-9]','','g'),'') IS NOT NULL
    AND NULLIF(regexp_replace(COALESCE(v_auth_phone,''),'[^0-9]','','g'),'')
      =NULLIF(regexp_replace(COALESCE(v_assisted.phone_number,''),'[^0-9]','','g'),'');
  SELECT s.secret_hash INTO v_secret_hash
  FROM public.assisted_profile_claim_secrets s
  WHERE s.assisted_profile_id=p_assisted_profile_id FOR UPDATE;
  v_secret_valid:=v_secret_hash IS NOT NULL AND p_verification_proof IS NOT NULL
    AND extensions.crypt(p_verification_proof,v_secret_hash)=v_secret_hash;

  IF NOT v_phone_matches OR NOT v_secret_valid THEN
    INSERT INTO public.assisted_profile_claims(
      assisted_profile_id,claimed_by_profile_id,claim_status,verification_method,
      verification_evidence,rejection_reason
    ) VALUES (
      p_assisted_profile_id,v_caller,'rejected','otp_and_secret_token',
      jsonb_build_object('phone_confirmed',v_phone_confirmed_at IS NOT NULL,
        'phone_match',v_phone_matches,'secret_valid',v_secret_valid),
      'Phone verification or claim secret validation failed.'
    );
    RETURN jsonb_build_object('success',false,'message','Phone verification or claim code is incorrect.');
  END IF;

  PERFORM set_config('quickhire.claim_rpc','on',true);
  UPDATE public.profiles SET claimed_by_profile_id=v_caller,updated_at=now()
  WHERE id=p_assisted_profile_id AND claimed_by_profile_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'message','This profile was claimed by another account.');
  END IF;
  INSERT INTO public.assisted_profile_claims(
    assisted_profile_id,claimed_by_profile_id,claim_status,verification_method,
    verification_evidence,verified_at,verified_by
  ) VALUES (
    p_assisted_profile_id,v_caller,'verified_and_claimed','otp_and_secret_token',
    jsonb_build_object('phone_confirmed',true,'phone_match',true,'secret_valid',true),
    now(),v_caller
  ) RETURNING id INTO v_claim_id;
  DELETE FROM public.assisted_profile_claim_secrets WHERE assisted_profile_id=p_assisted_profile_id;
  RETURN jsonb_build_object('success',true,'claim_id',v_claim_id,'profile_id',p_assisted_profile_id);
END
$$;

CREATE OR REPLACE FUNCTION public.admin_claim_assisted_worker_profile(
  p_assisted_profile_id uuid,
  p_worker_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
SET row_security = off
AS $$
DECLARE
  v_admin uuid:=auth.uid();
  v_assisted public.profiles%ROWTYPE;
  v_worker public.profiles%ROWTYPE;
  v_phone text;
  v_confirmed timestamptz;
  v_claim_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE='42501';
  END IF;
  IF p_assisted_profile_id=p_worker_profile_id THEN
    RAISE EXCEPTION 'A profile cannot claim itself.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_assisted FROM public.profiles WHERE id=p_assisted_profile_id FOR UPDATE;
  SELECT * INTO v_worker FROM public.profiles WHERE id=p_worker_profile_id FOR UPDATE;
  IF NOT FOUND OR v_assisted.is_assisted_profile IS NOT TRUE
     OR v_assisted.claimed_by_profile_id IS NOT NULL OR v_assisted.account_status<>'active'
     OR v_worker.id IS NULL OR v_worker.role::text<>'worker' OR v_worker.account_status<>'active' THEN
    RAISE EXCEPTION 'Eligible unclaimed assisted profile and active worker are required.' USING ERRCODE='P0002';
  END IF;
  SELECT phone,phone_confirmed_at INTO v_phone,v_confirmed FROM auth.users WHERE id=p_worker_profile_id;
  IF v_confirmed IS NULL OR NULLIF(regexp_replace(COALESCE(v_phone,''),'[^0-9]','','g'),'')
     IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(v_assisted.phone_number,''),'[^0-9]','','g'),'') THEN
    RAISE EXCEPTION 'The target worker must have a verified matching phone number.' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('quickhire.claim_rpc','on',true);
  UPDATE public.profiles SET claimed_by_profile_id=p_worker_profile_id,updated_at=now()
  WHERE id=p_assisted_profile_id AND claimed_by_profile_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This profile was claimed concurrently.' USING ERRCODE='40001'; END IF;
  INSERT INTO public.assisted_profile_claims(
    assisted_profile_id,claimed_by_profile_id,claim_status,verification_method,
    verification_evidence,verified_at,verified_by
  ) VALUES (
    p_assisted_profile_id,p_worker_profile_id,'verified_and_claimed','admin_verified',
    jsonb_build_object('phone_confirmed',true,'phone_match',true,'admin_verified',true),
    now(),v_admin
  ) RETURNING id INTO v_claim_id;
  DELETE FROM public.assisted_profile_claim_secrets WHERE assisted_profile_id=p_assisted_profile_id;
  RETURN jsonb_build_object('success',true,'claim_id',v_claim_id,'profile_id',p_assisted_profile_id);
END
$$;

CREATE OR REPLACE FUNCTION public.get_claimed_worker_reputation(p_worker_id uuid)
RETURNS TABLE(total_reviews bigint,average_rating numeric,total_completed_jobs bigint,claimed_profiles_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
SET row_security = off
AS $$
DECLARE v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR (p_worker_id<>auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'You may only view your own claimed-worker reputation.' USING ERRCODE='42501';
  END IF;
  SELECT ARRAY(SELECT p_worker_id UNION
    SELECT c.id FROM public.get_claimed_profile_ids(p_worker_id) c) INTO v_ids;
  RETURN QUERY
  SELECT count(r.id)::bigint,COALESCE(round(avg(r.rating)::numeric,2),5.0),
    (SELECT count(*)::bigint FROM public.job_records jr
      WHERE jr.worker_id=ANY(v_ids) AND jr.status IN ('completed','work_completed')),
    greatest(COALESCE(cardinality(v_ids),1)-1,0)::bigint
  FROM public.reviews r WHERE r.reviewed_profile_id=ANY(v_ids);
END
$$;

-- Keep deleted Auth identities as anonymized anchors so business history and
-- assisted profiles do not cascade-delete or become orphaned.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_created_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
SET row_security = off
AS $$
BEGIN
  DELETE FROM public.profile_private_details WHERE profile_id=OLD.id;
  DELETE FROM public.notifications WHERE profile_id=OLD.id;
  DELETE FROM public.worker_contact_rate_limits WHERE caller_id=OLD.id;
  UPDATE public.complaints SET reporter_name=NULL,reporter_phone=NULL WHERE reporter_id=OLD.id;
  UPDATE public.jobs SET status='cancelled',updated_at=now()
    WHERE employer_id=OLD.id AND status='open';
  UPDATE public.workers SET is_available=false,location=NULL,latitude=NULL,longitude=NULL,geocoded_address=NULL
    WHERE id=OLD.id;
  UPDATE public.profiles SET
    full_name='Deactivated User',phone_number=NULL,email=NULL,phone=NULL,gender=NULL,
    address_line=NULL,date_of_birth=NULL,village=NULL,city=NULL,district=NULL,state=NULL,pincode=NULL,
    location=NULL,latitude=NULL,longitude=NULL,geocoded_address=NULL,
    experience_description=NULL,preferred_work_location=NULL,availability_status='unavailable',
    bank_name=NULL,bank_account_no=NULL,bank_ifsc=NULL,upi_id=NULL,
    account_status='deactivated',updated_at=now()
  WHERE id=OLD.id;
  UPDATE public.profiles SET created_by=NULL WHERE created_by=OLD.id;
  UPDATE public.profiles SET claimed_by_profile_id=NULL,updated_at=now()
    WHERE claimed_by_profile_id=OLD.id;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
AFTER DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- A deleted/updated user cannot promote their own role or alter claim ownership.
CREATE OR REPLACE FUNCTION public.protect_profile_identity_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_admin(v_uid) THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.id=v_uid THEN
      IF NEW.role::text='admin' THEN RAISE EXCEPTION 'Admin role cannot be self-assigned.' USING ERRCODE='42501'; END IF;
      NEW.created_by:=NULL;
      NEW.is_assisted_profile:=false;
      NEW.claimed_by_profile_id:=NULL;
    ELSIF NEW.is_assisted_profile IS TRUE THEN
      IF NEW.created_by IS DISTINCT FROM v_uid OR NEW.role::text<>'worker'
         OR NOT public.is_active_profile(v_uid,'employer') THEN
        RAISE EXCEPTION 'Only an active employer may create an assisted worker profile.' USING ERRCODE='42501';
      END IF;
      NEW.claimed_by_profile_id:=NULL;
    ELSE
      RAISE EXCEPTION 'Users may create only their own account profile or an assisted worker profile.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN NEW.id:=OLD.id; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN NEW.role:=OLD.role; END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN NEW.created_by:=OLD.created_by; END IF;
    IF NEW.is_assisted_profile IS DISTINCT FROM OLD.is_assisted_profile THEN NEW.is_assisted_profile:=OLD.is_assisted_profile; END IF;
    IF NEW.claimed_by_profile_id IS DISTINCT FROM OLD.claimed_by_profile_id
       AND current_setting('quickhire.claim_rpc',true) IS DISTINCT FROM 'on' THEN
      NEW.claimed_by_profile_id:=OLD.claimed_by_profile_id;
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status
       AND NOT (OLD.id=v_uid AND NEW.account_status='deactivated') THEN
      NEW.account_status:=OLD.account_status;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS protect_profile_identity_fields ON public.profiles;
CREATE TRIGGER protect_profile_identity_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_identity_fields();

-- Replace broad profile SELECT/UPDATE policies with ownership and relationship access.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  LOOP EXECUTE format('DROP POLICY %I ON public.profiles',p.policyname); END LOOP;
END
$$;

CREATE POLICY profiles_select_authorized
ON public.profiles FOR SELECT TO authenticated
USING (
  id=(SELECT auth.uid())
  OR (is_assisted_profile IS TRUE AND created_by=(SELECT auth.uid()))
  OR claimed_by_profile_id=(SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.jobs j JOIN public.job_records jr ON jr.job_id=j.id
    WHERE (j.employer_id=(SELECT auth.uid()) AND (jr.worker_id=profiles.id
      OR jr.worker_id IN (SELECT c.id FROM public.get_claimed_profile_ids((SELECT auth.uid())) c)))
      OR (jr.worker_id=(SELECT auth.uid()) AND j.employer_id=profiles.id)
  )
);
CREATE POLICY profiles_insert_self_or_assisted
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  id=(SELECT auth.uid())
  OR (is_assisted_profile IS TRUE AND created_by=(SELECT auth.uid())
      AND role::text='worker' AND public.is_active_profile((SELECT auth.uid()),'employer'))
  OR public.is_admin((SELECT auth.uid()))
);
CREATE POLICY profiles_update_self_or_assisted
ON public.profiles FOR UPDATE TO authenticated
USING (
  id=(SELECT auth.uid())
  OR (is_assisted_profile IS TRUE AND created_by=(SELECT auth.uid())
      AND claimed_by_profile_id IS NULL AND public.is_active_profile((SELECT auth.uid()),'employer'))
  OR claimed_by_profile_id=(SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
)
WITH CHECK (
  id=(SELECT auth.uid())
  OR (is_assisted_profile IS TRUE AND created_by=(SELECT auth.uid())
      AND claimed_by_profile_id IS NULL AND public.is_active_profile((SELECT auth.uid()),'employer'))
  OR (is_assisted_profile IS TRUE AND claimed_by_profile_id=(SELECT auth.uid())
      AND public.is_active_profile((SELECT auth.uid()),'worker'))
  OR public.is_admin((SELECT auth.uid()))
);

-- Preserve historical job/payment visibility for the authenticated claimant.
DROP POLICY IF EXISTS "Job records read policy" ON public.job_records;
CREATE POLICY "Job records read policy"
ON public.job_records FOR SELECT TO authenticated
USING (
  worker_id=(SELECT auth.uid())
  OR worker_id IN (SELECT c.id FROM public.get_claimed_profile_ids((SELECT auth.uid())) c)
  OR public.is_admin((SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id=job_records.job_id AND j.employer_id=(SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Payments read policy" ON public.payments;
CREATE POLICY "Payments read policy"
ON public.payments FOR SELECT TO authenticated
USING (
  payer_id=(SELECT auth.uid()) OR payee_id=(SELECT auth.uid())
  OR payer_id IN (SELECT c.id FROM public.get_claimed_profile_ids((SELECT auth.uid())) c)
  OR payee_id IN (SELECT c.id FROM public.get_claimed_profile_ids((SELECT auth.uid())) c)
  OR public.is_admin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "claims_read_policy" ON public.assisted_profile_claims;
CREATE POLICY claims_read_policy
ON public.assisted_profile_claims FOR SELECT TO authenticated
USING (claimed_by_profile_id=(SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

REVOKE ALL ON TABLE public.assisted_profile_claim_secrets FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.assisted_profile_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.assisted_profile_claims TO authenticated;
GRANT ALL ON TABLE public.assisted_profile_claim_secrets,public.assisted_profile_claims TO service_role;

REVOKE ALL ON FUNCTION public.get_claimed_profile_ids(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_claimed_profile_ids(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_assisted_profile_claim_secret(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_assisted_profile_claim_secret(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_assisted_worker_profile(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_assisted_worker_profile(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_claim_assisted_worker_profile(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_claim_assisted_worker_profile(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_claimed_worker_reputation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_claimed_worker_reputation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_active_profile(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_active_profile(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_identity_fields() FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.get_claimed_profile_ids(uuid) IS
  'Returns claimed assisted profile IDs only to the authenticated claimant or an administrator.';
COMMENT ON FUNCTION public.claim_assisted_worker_profile(uuid,text,text) IS
  'Claims an assisted worker only after Auth-confirmed phone matching and one-time secret validation.';
COMMENT ON FUNCTION public.handle_auth_user_deleted() IS
  'Anonymizes deleted Auth identities while retaining job, payment, and assisted-profile history.';

COMMIT;
