-- ============================================================================
-- QUICKHIRE PHASE 2 MIGRATION: DIRECT PHONE HIRING, LIFECYCLE & LEDGER INTEGRITY
-- Migration Name: 20261031120000_phase2_direct_hiring_and_lifecycle.corrected.sql
-- Status: Corrected & Ready for Disposable Test Database
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: ADDITIVE COLUMNS & CONSTRAINTS ON PUBLIC.JOBS
-- ----------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS expected_duration_hours numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS workers_needed integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hiring_source text DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_hiring_source_check') THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_hiring_source_check
      CHECK (hiring_source IN ('application', 'direct_phone'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_workers_needed_check') THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_workers_needed_check
      CHECK (workers_needed > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_hiring_source ON public.jobs (hiring_source);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON public.jobs (scheduled_date);

-- ----------------------------------------------------------------------------
-- SECTION 2: ADDITIVE COLUMNS & CONSTRAINTS ON PUBLIC.JOB_RECORDS
-- ----------------------------------------------------------------------------
ALTER TABLE public.job_records
  ADD COLUMN IF NOT EXISTS hiring_source text DEFAULT 'application',
  ADD COLUMN IF NOT EXISTS agreement_evidence_type text DEFAULT 'worker_application_and_employer_acceptance',
  ADD COLUMN IF NOT EXISTS reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eta_minutes integer,
  ADD COLUMN IF NOT EXISTS eta_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS work_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_working_hours numeric,
  ADD COLUMN IF NOT EXISTS agreed_wage numeric,
  ADD COLUMN IF NOT EXISTS total_payable numeric,
  ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_records_hiring_source_check') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_hiring_source_check
      CHECK (hiring_source IN ('application', 'direct_phone'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_records_agreement_evidence_type_check') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_agreement_evidence_type_check
      CHECK (agreement_evidence_type IN (
        'worker_application_and_employer_acceptance',
        'employer_reported_verbal_agreement'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_records_payment_status_check') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_payment_status_check
      CHECK (payment_status IN ('pending', 'partially_paid', 'paid', 'disputed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_records_unique_job_worker') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_unique_job_worker UNIQUE (job_id, worker_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_records_status_check') THEN
    ALTER TABLE public.job_records
      ADD CONSTRAINT job_records_status_check
      CHECK (status IN (
        'contacted', 'applied', 'hired', 'confirmed', 'on_the_way',
        'arrived', 'attendance_confirmed', 'in_progress', 'on_break',
        'completed', 'payment_pending', 'partially_paid', 'paid',
        'cancelled', 'no_show', 'disputed', 'rejected'
      ));
  END IF;
END $$;

UPDATE public.job_records SET hiring_source = 'application' WHERE hiring_source IS NULL;
UPDATE public.job_records SET agreement_evidence_type = 'worker_application_and_employer_acceptance' WHERE agreement_evidence_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_records_hiring_source ON public.job_records (hiring_source);
CREATE INDEX IF NOT EXISTS idx_job_records_payment_status ON public.job_records (payment_status);
CREATE INDEX IF NOT EXISTS idx_job_records_status_created ON public.job_records (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_records_job_worker ON public.job_records (job_id, worker_id);

-- ----------------------------------------------------------------------------
-- SECTION 3: ADDITIVE COLUMNS ON PUBLIC.PAYMENTS & REFUND STRUCTURE
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.job_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_payments_assignment_id ON public.payments (assignment_id);
CREATE INDEX IF NOT EXISTS idx_payments_parent_payment_id ON public.payments (parent_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_receipt_number ON public.payments (receipt_number);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_ref ON public.payments (transaction_ref) WHERE transaction_ref IS NOT NULL;

-- Ensure payment_audit_events references payments with ON DELETE RESTRICT (not cascade)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_audit_events_payment_id_fkey'
      AND table_name = 'payment_audit_events'
  ) THEN
    ALTER TABLE public.payment_audit_events
      DROP CONSTRAINT payment_audit_events_payment_id_fkey;

    ALTER TABLE public.payment_audit_events
      ADD CONSTRAINT payment_audit_events_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 4: CALLER IDENTIFICATION HELPER (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_validated_caller_context(
  OUT p_caller_id uuid,
  OUT p_role text,
  OUT p_is_admin boolean,
  OUT p_is_service_role boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid uuid;
  v_auth_role text;
BEGIN
  BEGIN
    v_auth_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_auth_uid := NULL;
  END;

  BEGIN
    v_auth_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_auth_role := NULL;
  END;

  p_caller_id := v_auth_uid;
  p_role := COALESCE(v_auth_role, '');
  p_is_service_role := (v_auth_role = 'service_role');

  -- Detect direct superuser/psql console maintenance
  IF p_caller_id IS NULL AND NOT p_is_service_role THEN
    IF session_user IN ('postgres', 'supabase_admin') AND (v_auth_role IS NULL OR v_auth_role = '') THEN
      p_is_admin := true;
      p_role := 'direct_admin';
      RETURN;
    END IF;
  END IF;

  IF p_is_service_role THEN
    p_is_admin := true;
  ELSIF p_caller_id IS NOT NULL THEN
    p_is_admin := public.is_admin(p_caller_id);
  ELSE
    p_is_admin := false;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 5: FIELD-LEVEL AUTHORIZATION & TRANSITION TRIGGER ON JOB_RECORDS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_job_record_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_is_admin boolean;
  v_is_service_role boolean;
  v_is_employer boolean := false;
  v_is_worker boolean := false;
  v_employer_id uuid;
  v_job_status text;
  v_offered_wages numeric;
  v_workers_needed integer;
  v_computed_paid numeric := 0;
  v_disputed_count integer := 0;
BEGIN
  SELECT p_caller_id, p_role, p_is_admin, p_is_service_role
  INTO v_caller_id, v_caller_role, v_is_admin, v_is_service_role
  FROM public.get_validated_caller_context();

  IF v_caller_id IS NULL AND NOT v_is_service_role AND v_caller_role <> 'direct_admin' THEN
    RAISE EXCEPTION 'QuickHire Security Violation: Unauthenticated operations are strictly forbidden.'
      USING ERRCODE = '42501';
  END IF;

  -- Fetch parent job attributes
  SELECT j.employer_id, j.status, j.offered_wages, j.workers_needed
  INTO v_employer_id, v_job_status, v_offered_wages, v_workers_needed
  FROM public.jobs j
  WHERE j.id = NEW.job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QuickHire Integrity Violation: Referenced job % does not exist.', NEW.job_id;
  END IF;

  v_is_employer := (v_caller_id IS NOT NULL AND v_caller_id = v_employer_id);
  v_is_worker := (v_caller_id IS NOT NULL AND v_caller_id = NEW.worker_id);

  -- =========================================================================
  -- 5.1 INSERT VALIDATION (STRICT WORKFLOW & INITIAL STATE RULES)
  -- =========================================================================
  IF TG_OP = 'INSERT' THEN
    IF v_job_status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'QuickHire Lifecycle Violation: Cannot create an assignment for a % job.', v_job_status;
    END IF;

    -- WORKFLOW A: Worker Self-Application
    IF v_is_worker AND NOT (v_is_employer OR v_is_admin) THEN
      IF NEW.hiring_source <> 'application' THEN
        RAISE EXCEPTION 'QuickHire Workflow Violation: Worker self-application must specify hiring_source = ''application''.'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.agreement_evidence_type <> 'worker_application_and_employer_acceptance' THEN
        RAISE EXCEPTION 'QuickHire Workflow Violation: Worker self-application requires agreement_evidence_type = ''worker_application_and_employer_acceptance''.'
          USING ERRCODE = '42501';
      END IF;
      -- Worker can ONLY apply with initial status 'applied'
      IF NEW.status <> 'applied' THEN
        RAISE EXCEPTION 'QuickHire Security Violation: Worker cannot insert an assignment directly into status ''%''. Workers may only apply with status ''applied''.', NEW.status
          USING ERRCODE = '42501';
      END IF;

      NEW.reported_by := v_caller_id;
      NEW.agreed_wage := COALESCE(v_offered_wages, 0);
      NEW.total_payable := COALESCE(v_offered_wages, 0);
      NEW.total_paid := 0;
      NEW.payment_status := 'pending';
      NEW.arrived_at := NULL;
      NEW.arrived_reported_by := NULL;
      NEW.attendance_confirmed_at := NULL;
      NEW.attendance_confirmed_by := NULL;
      NEW.work_started_at := NULL;
      NEW.work_completed_at := NULL;
      NEW.break_minutes := 0;
      NEW.overtime_hours := 0;
      NEW.total_working_hours := NULL;
      RETURN NEW;

    -- WORKFLOW B: Direct Phone Hiring by Job Employer
    ELSIF v_is_employer AND NOT v_is_admin THEN
      IF NEW.hiring_source <> 'direct_phone' THEN
        RAISE EXCEPTION 'QuickHire Workflow Violation: Employer direct assignment must specify hiring_source = ''direct_phone''.'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.agreement_evidence_type <> 'employer_reported_verbal_agreement' THEN
        RAISE EXCEPTION 'QuickHire Workflow Violation: Employer direct assignment requires agreement_evidence_type = ''employer_reported_verbal_agreement''.'
          USING ERRCODE = '42501';
      END IF;
      -- Employer can record direct agreement as 'hired' (or 'contacted')
      IF NEW.status NOT IN ('hired', 'contacted') THEN
        RAISE EXCEPTION 'QuickHire Security Violation: Employer direct phone assignment cannot be inserted directly with status ''%''. Permitted initial states are ''hired'' or ''contacted''.', NEW.status
          USING ERRCODE = '42501';
      END IF;

      NEW.reported_by := v_caller_id;
      NEW.agreed_wage := COALESCE(NEW.agreed_wage, v_offered_wages, 0);
      NEW.total_payable := COALESCE(NEW.total_payable, NEW.agreed_wage);
      NEW.total_paid := 0;
      NEW.payment_status := 'pending';
      NEW.arrived_at := NULL;
      NEW.arrived_reported_by := NULL;
      NEW.attendance_confirmed_at := NULL;
      NEW.attendance_confirmed_by := NULL;
      NEW.work_started_at := NULL;
      NEW.work_completed_at := NULL;
      NEW.break_minutes := 0;
      NEW.overtime_hours := 0;
      NEW.total_working_hours := NULL;
      RETURN NEW;

    -- Administrative or Service-Role Insert
    ELSIF v_is_admin OR v_is_service_role THEN
      NEW.total_paid := 0;
      NEW.payment_status := 'pending';
      RETURN NEW;

    ELSE
      RAISE EXCEPTION 'QuickHire Authorization Failure: Only the job employer, the applying worker, or an administrator can create an assignment.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- =========================================================================
  -- 5.2 UPDATE VALIDATION (IMMUTABILITY & FIELD-LEVEL ACCESS CONTROL)
  -- =========================================================================

  -- IMMUTABLE COLUMN GUARDS
  IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'QuickHire Integrity Violation: job_id is strictly immutable.';
  END IF;
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    RAISE EXCEPTION 'QuickHire Integrity Violation: worker_id is strictly immutable.';
  END IF;
  IF NEW.hiring_source IS DISTINCT FROM OLD.hiring_source THEN
    RAISE EXCEPTION 'QuickHire Integrity Violation: hiring_source is strictly immutable.';
  END IF;
  IF NEW.agreement_evidence_type IS DISTINCT FROM OLD.agreement_evidence_type THEN
    RAISE EXCEPTION 'QuickHire Integrity Violation: agreement_evidence_type is strictly immutable.';
  END IF;
  IF NEW.reported_by IS DISTINCT FROM OLD.reported_by THEN
    RAISE EXCEPTION 'QuickHire Integrity Violation: reported_by is strictly immutable.';
  END IF;

  -- PARTICIPANT ACCESS CHECK
  IF NOT (v_is_admin OR v_is_employer OR v_is_worker OR v_is_service_role) THEN
    RAISE EXCEPTION 'QuickHire Authorization Failure: Caller is not a participant in this assignment.'
      USING ERRCODE = '42501';
  END IF;

  -- FINANCIAL FIELD PROTECTION: agreed_wage & total_payable
  IF (NEW.agreed_wage IS DISTINCT FROM OLD.agreed_wage OR NEW.total_payable IS DISTINCT FROM OLD.total_payable) THEN
    IF NOT (v_is_admin OR v_is_employer OR v_is_service_role) THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Only employers or admins can modify wage terms.'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.total_paid > 0 THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: Wage terms cannot be altered after payments have settled.';
    END IF;
    IF NEW.agreed_wage IS NOT NULL AND NEW.agreed_wage <= 0 THEN
      RAISE EXCEPTION 'QuickHire Validation Error: agreed_wage must be strictly greater than zero.';
    END IF;
    IF NEW.total_payable IS NOT NULL AND NEW.total_payable <= 0 THEN
      RAISE EXCEPTION 'QuickHire Validation Error: total_payable must be strictly greater than zero.';
    END IF;
  END IF;

  -- WORKER-RESTRICTED FIELDS
  IF v_is_worker AND NOT (v_is_employer OR v_is_admin) THEN
    IF NEW.attendance_confirmed_at IS DISTINCT FROM OLD.attendance_confirmed_at OR
       NEW.attendance_confirmed_by IS DISTINCT FROM OLD.attendance_confirmed_by THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Workers cannot self-confirm attendance.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.work_started_at IS DISTINCT FROM OLD.work_started_at THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Workers cannot record shift start.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.work_completed_at IS DISTINCT FROM OLD.work_completed_at OR
       NEW.total_working_hours IS DISTINCT FROM OLD.total_working_hours OR
       NEW.overtime_hours IS DISTINCT FROM OLD.overtime_hours THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Workers cannot mark work completed or modify working hours.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- EMPLOYEE ETA RESTRICTION (Only assigned worker can update ETA)
  IF (NEW.eta_minutes IS DISTINCT FROM OLD.eta_minutes OR NEW.eta_updated_at IS DISTINCT FROM OLD.eta_updated_at) THEN
    IF NOT (v_is_worker OR v_is_admin) THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Only the assigned worker can update their ETA.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.eta_minutes IS NOT NULL AND (NEW.eta_minutes < 0 OR NEW.eta_minutes > 1440) THEN
      RAISE EXCEPTION 'QuickHire Validation Error: eta_minutes must be between 0 and 1440.';
    END IF;
    NEW.eta_updated_at := now();
  END IF;

  -- ATTENDANCE CONFIRMATION ATTRIBUTION
  IF (NEW.attendance_confirmed_at IS DISTINCT FROM OLD.attendance_confirmed_at) THEN
    IF NOT (v_is_employer OR v_is_admin) THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Only the job employer can confirm attendance.'
        USING ERRCODE = '42501';
    END IF;
    NEW.attendance_confirmed_by := v_caller_id;
  END IF;

  -- CANCELLATION ATTRIBUTION
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    NEW.cancelled_by := v_caller_id;
    NEW.cancelled_at := now();
  END IF;

  -- LIFECYCLE STATE TRANSITIONS
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (v_is_admin OR v_is_service_role) THEN
      CASE OLD.status
        WHEN 'applied' THEN
          IF NOT ((v_is_worker AND NEW.status = 'cancelled') OR (v_is_employer AND NEW.status IN ('hired', 'rejected'))) THEN
            RAISE EXCEPTION 'Invalid transition from applied to % by caller.', NEW.status;
          END IF;
        WHEN 'hired' THEN
          IF NOT ((v_is_worker AND NEW.status IN ('confirmed', 'cancelled')) OR (v_is_employer AND NEW.status = 'cancelled')) THEN
            RAISE EXCEPTION 'Invalid transition from hired to % by caller.', NEW.status;
          END IF;
        WHEN 'confirmed' THEN
          IF NOT ((v_is_worker AND NEW.status = 'on_the_way') OR (v_is_employer AND NEW.status IN ('cancelled', 'no_show'))) THEN
            RAISE EXCEPTION 'Invalid transition from confirmed to % by caller.', NEW.status;
          END IF;
        WHEN 'on_the_way' THEN
          IF NOT ((v_is_worker AND NEW.status = 'arrived') OR (v_is_employer AND NEW.status IN ('no_show', 'cancelled'))) THEN
            RAISE EXCEPTION 'Invalid transition from on_the_way to % by caller.', NEW.status;
          END IF;
        WHEN 'arrived' THEN
          IF NOT (v_is_employer AND NEW.status IN ('attendance_confirmed', 'in_progress', 'cancelled')) THEN
            RAISE EXCEPTION 'Invalid transition from arrived to % by caller.', NEW.status;
          END IF;
        WHEN 'attendance_confirmed' THEN
          IF NOT (v_is_employer AND NEW.status IN ('in_progress', 'cancelled')) THEN
            RAISE EXCEPTION 'Invalid transition from attendance_confirmed to % by caller.', NEW.status;
          END IF;
        WHEN 'in_progress' THEN
          IF NOT ((v_is_employer AND NEW.status IN ('on_break', 'completed', 'disputed')) OR (v_is_worker AND NEW.status IN ('on_break', 'disputed'))) THEN
            RAISE EXCEPTION 'Invalid transition from in_progress to % by caller.', NEW.status;
          END IF;
        WHEN 'on_break' THEN
          IF NOT ((v_is_employer AND NEW.status IN ('in_progress', 'completed', 'disputed')) OR (v_is_worker AND NEW.status = 'in_progress')) THEN
            RAISE EXCEPTION 'Invalid transition from on_break to % by caller.', NEW.status;
          END IF;
        WHEN 'completed' THEN
          IF NOT ((v_is_employer AND NEW.status IN ('payment_pending', 'partially_paid', 'paid', 'disputed')) OR (v_is_worker AND NEW.status = 'disputed')) THEN
            RAISE EXCEPTION 'Invalid transition from completed to % by caller.', NEW.status;
          END IF;
        ELSE
          IF OLD.status IN ('paid', 'cancelled', 'rejected', 'no_show') AND NOT v_is_admin THEN
            RAISE EXCEPTION 'QuickHire Lifecycle Violation: State % is terminal and cannot be modified.', OLD.status;
          END IF;
      END CASE;
    END IF;
  END IF;

  -- =========================================================================
  -- 5.3 AUTOMATIC AUTHORITATIVE LEDGER RECALCULATION
  -- =========================================================================
  -- Compute net confirmed settlement from public.payments
  SELECT
    COALESCE(SUM(
      CASE
        WHEN p.status IN ('refunded', 'reversed') THEN 0
        WHEN (p.status IN ('completed', 'paid', 'disputed') AND p.verification_status IN ('user_reported', 'verified')) THEN
          p.amount - COALESCE((
            SELECT SUM(c.amount)
            FROM public.payments c
            WHERE c.parent_payment_id = p.id
              AND c.status = 'refunded'
              AND c.verification_status = 'verified'
          ), 0)
        ELSE 0
      END
    ), 0),
    COUNT(*) FILTER (WHERE p.status = 'disputed' OR p.verification_status = 'disputed')
  INTO v_computed_paid, v_disputed_count
  FROM public.payments p
  WHERE p.assignment_id = NEW.id
    AND p.parent_payment_id IS NULL;

  -- Overwrite client-provided total_paid with mathematically verified ledger sum
  NEW.total_paid := GREATEST(0, v_computed_paid);

  IF v_disputed_count > 0 THEN
    NEW.payment_status := 'disputed';
  ELSIF NEW.total_paid >= COALESCE(NEW.total_payable, 0) AND COALESCE(NEW.total_payable, 0) > 0 THEN
    NEW.payment_status := 'paid';
  ELSIF NEW.total_paid > 0 THEN
    NEW.payment_status := 'partially_paid';
  ELSE
    NEW.payment_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_job_record_transition ON public.job_records;
CREATE TRIGGER trg_validate_job_record_transition
  BEFORE INSERT OR UPDATE ON public.job_records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_job_record_transition();

-- ----------------------------------------------------------------------------
-- SECTION 6: CONCURRENCY-SAFE JOB CAPACITY TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_job_worker_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
  v_workers_needed integer;
  v_active_workers_count integer;
  v_job_status text;
BEGIN
  IF TG_TABLE_NAME = 'job_records' THEN
    v_job_id := NEW.job_id;

    -- Capacity is only reserved once record is hired or active
    IF NEW.status NOT IN (
      'hired', 'confirmed', 'on_the_way', 'arrived',
      'attendance_confirmed', 'in_progress', 'on_break', 'completed'
    ) THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.job_id = NEW.job_id THEN
      RETURN NEW;
    END IF;

    -- PESSIMISTIC LOCK: Lock parent job row to serialize concurrent hiring
    SELECT workers_needed, status
    INTO v_workers_needed, v_job_status
    FROM public.jobs
    WHERE id = v_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: Referenced job % does not exist.', v_job_id;
    END IF;

    IF v_job_status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'QuickHire Capacity Violation: Cannot assign workers to a % job.', v_job_status;
    END IF;

    SELECT COUNT(*)
    INTO v_active_workers_count
    FROM public.job_records
    WHERE job_id = v_job_id
      AND status IN (
        'hired', 'confirmed', 'on_the_way', 'arrived',
        'attendance_confirmed', 'in_progress', 'on_break', 'completed'
      )
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF (v_active_workers_count + 1) > COALESCE(v_workers_needed, 1) THEN
      RAISE EXCEPTION 'QuickHire Capacity Exceeded: Job % requires % worker(s), but % are already assigned.',
        v_job_id, v_workers_needed, v_active_workers_count
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;

  ELSIF TG_TABLE_NAME = 'jobs' THEN
    IF NEW.workers_needed < OLD.workers_needed THEN
      SELECT COUNT(*)
      INTO v_active_workers_count
      FROM public.job_records
      WHERE job_id = NEW.id
        AND status IN (
          'hired', 'confirmed', 'on_the_way', 'arrived',
          'attendance_confirmed', 'in_progress', 'on_break', 'completed'
        );

      IF v_active_workers_count > NEW.workers_needed THEN
        RAISE EXCEPTION 'QuickHire Capacity Violation: Cannot reduce workers_needed to % because % active workers are currently assigned.',
          NEW.workers_needed, v_active_workers_count
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_job_worker_capacity_record ON public.job_records;
CREATE TRIGGER trg_check_job_worker_capacity_record
  BEFORE INSERT OR UPDATE OF status, job_id ON public.job_records
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_worker_capacity();

DROP TRIGGER IF EXISTS trg_check_job_worker_capacity_job ON public.jobs;
CREATE TRIGGER trg_check_job_worker_capacity_job
  BEFORE UPDATE OF workers_needed ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_worker_capacity();

-- ----------------------------------------------------------------------------
-- SECTION 7: OVERPAYMENT, REFUND CAPS & LEDGER SYNCHRONIZATION ON PAYMENTS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_payment_integrity_and_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_is_admin boolean;
  v_is_service_role boolean;
  v_total_payable numeric;
  v_net_settled numeric;
  v_pending_claims numeric;
  v_parent_amount numeric;
  v_parent_currency text;
  v_parent_status text;
  v_parent_verification_status text;
  v_parent_assignment_id uuid;
  v_parent_payer_id uuid;
  v_parent_payee_id uuid;
  v_existing_child_refunds numeric;
BEGIN
  SELECT p_caller_id, p_role, p_is_admin, p_is_service_role
  INTO v_caller_id, v_caller_role, v_is_admin, v_is_service_role
  FROM public.get_validated_caller_context();

  IF v_caller_id IS NULL AND NOT v_is_service_role AND v_caller_role <> 'direct_admin' THEN
    RAISE EXCEPTION 'QuickHire Security Violation: Unauthenticated operations are strictly forbidden.'
      USING ERRCODE = '42501';
  END IF;

  -- 1. STRICT AMOUNT VALIDATION (Reject NULL, zero, and negative)
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'QuickHire Validation Error: Payment amount must be strictly greater than zero and cannot be NULL.'
      USING ERRCODE = '23514';
  END IF;

  -- 2. IMMUTABILITY ON UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: payment id is strictly immutable.';
    END IF;
    -- Assignment linkage is strictly immutable
    IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: payment assignment_id is strictly immutable after creation.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.parent_payment_id IS DISTINCT FROM OLD.parent_payment_id THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: parent_payment_id cannot be reassigned.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.payer_id IS DISTINCT FROM OLD.payer_id THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: payer_id cannot be altered.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.payee_id IS DISTINCT FROM OLD.payee_id THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: payee_id cannot be altered.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: currency cannot be altered.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: recorded_by cannot be altered.'
        USING ERRCODE = '42501';
    END IF;

    -- Amount is immutable for settled or submitted payments
    IF (NEW.amount IS DISTINCT FROM OLD.amount) THEN
      IF NOT (v_is_admin OR v_is_service_role) THEN
        RAISE EXCEPTION 'QuickHire Authorization Failure: Non-admins cannot alter payment amounts.'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.status IN ('completed', 'paid', 'submitted') THEN
        RAISE EXCEPTION 'QuickHire Integrity Violation: Settled or submitted payment amounts cannot be modified. Issue a refund or reversal instead.';
      END IF;
    END IF;

    -- Verification status escalation guard
    IF NEW.verification_status = 'verified' AND (OLD.verification_status IS NULL OR OLD.verification_status <> 'verified') THEN
      IF NOT (v_is_admin OR v_is_service_role) THEN
        RAISE EXCEPTION 'QuickHire Authorization Failure: Only administrators can mark payments as verified.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Reversal / Full Refund of Parent Row validation
    IF (NEW.status IN ('refunded', 'reversed') AND OLD.status NOT IN ('refunded', 'reversed')) THEN
      IF NOT (v_is_admin OR v_is_service_role) THEN
        RAISE EXCEPTION 'QuickHire Authorization Failure: Only administrators can reverse or refund payments.'
          USING ERRCODE = '42501';
      END IF;

      -- Check if parent already has child refunds
      SELECT COALESCE(SUM(amount), 0)
      INTO v_existing_child_refunds
      FROM public.payments
      WHERE parent_payment_id = OLD.id
        AND status = 'refunded'
        AND verification_status = 'verified';

      IF v_existing_child_refunds > 0 THEN
        RAISE EXCEPTION 'QuickHire Refund Violation: Parent payment has active child refunds (₹%). Remainder must be refunded via a child refund for ₹%, not a parent status transition.',
          v_existing_child_refunds, (OLD.amount - v_existing_child_refunds);
      END IF;
    END IF;
  END IF;

  -- 3. CHILD REFUND INTEGRITY
  IF NEW.parent_payment_id IS NOT NULL THEN
    IF NOT (v_is_admin OR v_is_service_role) THEN
      RAISE EXCEPTION 'QuickHire Authorization Failure: Only administrators can record child refunds.'
        USING ERRCODE = '42501';
    END IF;

    SELECT id, assignment_id, payer_id, payee_id, currency, amount, status, verification_status
    INTO NEW.parent_payment_id, v_parent_assignment_id, v_parent_payer_id, v_parent_payee_id,
         v_parent_currency, v_parent_amount, v_parent_status, v_parent_verification_status
    FROM public.payments
    WHERE id = NEW.parent_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: Referenced parent payment % does not exist.', NEW.parent_payment_id;
    END IF;

    IF v_parent_status IN ('refunded', 'reversed') THEN
      RAISE EXCEPTION 'QuickHire Refund Violation: Parent payment % is already fully %.', NEW.parent_payment_id, v_parent_status;
    END IF;

    -- Enforce participant and currency consistency
    NEW.assignment_id := v_parent_assignment_id;
    NEW.payer_id := v_parent_payer_id;
    NEW.payee_id := v_parent_payee_id;
    NEW.currency := v_parent_currency;
    NEW.status := 'refunded';
    NEW.verification_status := 'verified';
    NEW.payment_method := 'Refund';

    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_child_refunds
    FROM public.payments
    WHERE parent_payment_id = NEW.parent_payment_id
      AND status = 'refunded'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF (v_existing_child_refunds + NEW.amount) > v_parent_amount THEN
      RAISE EXCEPTION 'QuickHire Refund Violation: Total child refunds (₹%) exceed parent payment amount (₹%). Available refundable: ₹%.',
        (v_existing_child_refunds + NEW.amount), v_parent_amount, (v_parent_amount - v_existing_child_refunds)
        USING ERRCODE = '23514';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- 4. ORIGINAL PAYMENT & OVERPAYMENT INTEGRITY
  IF NEW.assignment_id IS NOT NULL THEN
    -- Pessimistic lock on parent assignment
    SELECT total_payable, agreed_wage
    INTO v_total_payable, v_parent_amount
    FROM public.job_records
    WHERE id = NEW.assignment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'QuickHire Integrity Violation: Referenced assignment % does not exist.', NEW.assignment_id;
    END IF;

    -- Resolve unknown payable
    IF v_total_payable IS NULL OR v_total_payable <= 0 THEN
      v_total_payable := v_parent_amount;
    END IF;

    IF v_total_payable IS NULL OR v_total_payable <= 0 THEN
      SELECT offered_wages INTO v_total_payable
      FROM public.jobs
      WHERE id = (SELECT job_id FROM public.job_records WHERE id = NEW.assignment_id);
    END IF;

    IF v_total_payable IS NULL OR v_total_payable <= 0 THEN
      RAISE EXCEPTION 'QuickHire Overpayment Check Error: Assignment total_payable is undefined. Payment cannot be recorded until wage terms are determined.'
        USING ERRCODE = '23514';
    END IF;

    -- Calculate current settled balance
    SELECT COALESCE(SUM(
      CASE
        WHEN p.status IN ('refunded', 'reversed') THEN 0
        WHEN (p.status IN ('completed', 'paid', 'disputed') AND p.verification_status IN ('user_reported', 'verified')) THEN
          p.amount - COALESCE((
            SELECT SUM(c.amount)
            FROM public.payments c
            WHERE c.parent_payment_id = p.id
              AND c.status = 'refunded'
              AND c.verification_status = 'verified'
          ), 0)
        ELSE 0
      END
    ), 0)
    INTO v_net_settled
    FROM public.payments p
    WHERE p.assignment_id = NEW.assignment_id
      AND p.parent_payment_id IS NULL
      AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

    -- Calculate pending submitted claims
    SELECT COALESCE(SUM(amount), 0)
    INTO v_pending_claims
    FROM public.payments
    WHERE assignment_id = NEW.assignment_id
      AND status = 'submitted'
      AND verification_status = 'pending_verification'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF NEW.status IN ('completed', 'paid', 'submitted') THEN
      IF (v_net_settled + v_pending_claims + NEW.amount) > v_total_payable THEN
        RAISE EXCEPTION 'QuickHire Overpayment Violation: Total payments and pending claims (₹%) exceed agreed payable (₹%). Settled: ₹%, Pending: ₹%, Attempted: ₹%.',
          (v_net_settled + v_pending_claims + NEW.amount), v_total_payable, v_net_settled, v_pending_claims, NEW.amount
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  NEW.recorded_by := COALESCE(v_caller_id, NEW.recorded_by);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_integrity_and_limits ON public.payments;
CREATE TRIGGER trg_validate_payment_integrity_and_limits
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_integrity_and_limits();

-- Synchronize parent assignment on payment mutations
CREATE OR REPLACE FUNCTION public.sync_assignment_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment_id uuid;
BEGIN
  v_assignment_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.assignment_id ELSE NEW.assignment_id END;
  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.job_records
    SET updated_at = now()
    WHERE id = v_assignment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_assignment_payment_ledger ON public.payments;
CREATE TRIGGER trg_sync_assignment_payment_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_assignment_payment_ledger();

-- ----------------------------------------------------------------------------
-- SECTION 8: IMMUTABLE AUDIT TRAIL & PREVENTING CASCADING DELETIONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_payment_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'QuickHire Security Violation: Financial records in public.payments are strictly immutable and cannot be deleted.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_deletion ON public.payments;
CREATE TRIGGER trg_prevent_payment_deletion
  BEFORE DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_payment_deletion();

CREATE OR REPLACE FUNCTION public.prevent_audit_tampering()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'QuickHire Security Violation: Audit logs in public.payment_audit_events are append-only and cannot be updated or deleted.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_tampering ON public.payment_audit_events;
CREATE TRIGGER trg_prevent_audit_tampering
  BEFORE UPDATE OR DELETE ON public.payment_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_tampering();

CREATE OR REPLACE FUNCTION public.log_payment_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'PAYMENT_CREATED';
  ELSIF NEW.status = 'refunded' AND OLD.status <> 'refunded' THEN
    v_event := 'PAYMENT_REFUNDED';
  ELSIF NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    v_event := 'PAYMENT_REVERSED';
  ELSIF NEW.status = 'disputed' AND OLD.status <> 'disputed' THEN
    v_event := 'PAYMENT_DISPUTED';
  ELSIF NEW.verification_status = 'verified' AND OLD.verification_status <> 'verified' THEN
    v_event := 'PAYMENT_VERIFIED';
  ELSE
    v_event := 'PAYMENT_UPDATED';
  END IF;

  INSERT INTO public.payment_audit_events (
    payment_id,
    previous_status,
    new_status,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    v_event,
    COALESCE(v_caller_id, NEW.recorded_by),
    jsonb_build_object(
      'op', TG_OP,
      'assignment_id', NEW.assignment_id,
      'amount', NEW.amount,
      'parent_payment_id', NEW.parent_payment_id,
      'verification_status', NEW.verification_status,
      'payment_method', NEW.payment_method,
      'transaction_ref', NEW.transaction_ref
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_audit_event ON public.payments;
CREATE TRIGGER trg_log_payment_audit_event
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_payment_audit_event();

-- ----------------------------------------------------------------------------
-- SECTION 9: ROW LEVEL SECURITY & PERMISSION HARDENING (DYNAMIC TOTAL WIPE)
-- ----------------------------------------------------------------------------
ALTER TABLE public.job_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_events ENABLE ROW LEVEL SECURITY;

-- 9.1 Drop ALL existing policies on these tables to prevent permissive-OR bypass
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('job_records', 'payments', 'payment_audit_events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 9.2 Recreate hardened RLS policies
CREATE POLICY "Job records read policy"
  ON public.job_records FOR SELECT
  TO authenticated
  USING (
    auth.uid() = worker_id
    OR public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_records.job_id AND j.employer_id = auth.uid())
  );

CREATE POLICY "Job records insert policy"
  ON public.job_records FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (auth.uid() = worker_id AND hiring_source = 'application' AND agreement_evidence_type = 'worker_application_and_employer_acceptance')
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_records.job_id AND j.employer_id = auth.uid())
  );

CREATE POLICY "Job records update policy"
  ON public.job_records FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = worker_id
    OR public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_records.job_id AND j.employer_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = worker_id
    OR public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_records.job_id AND j.employer_id = auth.uid())
  );

CREATE POLICY "Payments read policy"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = payer_id
    OR auth.uid() = payee_id
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Payments insert policy"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = payer_id OR public.is_admin(auth.uid()))
    AND (
      public.is_admin(auth.uid())
      OR ((status IS NULL OR status IN ('created', 'pending')) AND (verification_status IS NULL OR verification_status = 'unverified'))
      OR (status = 'submitted' AND verification_status = 'pending_verification')
      OR (status = 'completed' AND verification_status = 'user_reported' AND payment_method = 'Cash')
    )
  );

CREATE POLICY "Payments update policy"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (auth.uid() = payer_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = payer_id OR public.is_admin(auth.uid()));

CREATE POLICY "Audit events read policy"
  ON public.payment_audit_events FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_audit_events.payment_id
        AND (p.payer_id = auth.uid() OR p.payee_id = auth.uid())
    )
  );

-- 9.3 Grants and revocations (Least Privilege)
GRANT SELECT, INSERT, UPDATE ON public.job_records TO authenticated;
REVOKE DELETE ON public.job_records FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
REVOKE DELETE ON public.payments FROM authenticated;

GRANT SELECT ON public.payment_audit_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_audit_events FROM authenticated;

REVOKE ALL ON public.job_records FROM anon;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.payment_audit_events FROM anon;

