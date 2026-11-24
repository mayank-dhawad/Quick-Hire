-- ============================================================================
-- QUICKHIRE DIRECT UPI PAYMENT & SETTLEMENT RECONCILIATION MIGRATION
-- Migration Name: 20261025220000_direct_upi_payments_and_reconciliation.sql
-- Description:
--   1. Additive enhancements to public.payments:
--      - payment_reference (unique attempt reference e.g. QH-PAY-...)
--      - currency (default 'INR')
--      - verification_status ('unverified', 'pending_verification', 'verified', 'rejected')
--      - verification_notes, verified_at, verified_by, updated_at
--   2. Payment Audit Trail: public.payment_audit_events table
--   3. Strict Row Level Security:
--      - Payers can create pending attempts for jobs/rentals
--      - Payers/Payees can view their own payment records
--      - Payers can submit UTR numbers for pending verification
--      - Ordinary users CANNOT arbitrarily mark payments as 'paid' or 'verified'
--      - Administrative reconciliation protected by public.is_admin()
-- Safety:
--   - 100% Non-destructive: No DROP TABLE, no TRUNCATE, zero data loss.
--   - Fully idempotent (IF NOT EXISTS / DO blocks).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: ADDITIVE COLUMNS ON PUBLIC.PAYMENTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure status default is 'pending' for new attempts (not blindly 'completed')
ALTER TABLE public.payments ALTER COLUMN status SET DEFAULT 'pending';

-- Add unique index on payment_reference if provided
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_reference
  ON public.payments (payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_verification_status
  ON public.payments (verification_status);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON public.payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_reference_payee
  ON public.payments (reference_id, payee_id);

-- ----------------------------------------------------------------------------
-- SECTION 2: PAYMENT AUDIT EVENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  event_type text NOT NULL, -- 'attempt_created', 'intent_launched', 'utr_submitted', 'admin_verified', 'admin_rejected', 'cancelled'
  actor_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_events_payment_id
  ON public.payment_audit_events (payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_events_actor_id
  ON public.payment_audit_events (actor_id);

-- ----------------------------------------------------------------------------
-- SECTION 3: ANTI-TAMPER TRIGGER PREVENTING UNAUTHORIZED STATUS ESCALATION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_payment_status_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_caller_admin boolean := false;
BEGIN
  -- If invoked in service-role or migration context without auth.uid(), allow
  IF v_caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if caller is verified administrator
  SELECT public.is_admin(v_caller_id) INTO v_is_caller_admin;

  -- If status is changing to 'paid' or verification_status is changing to 'verified'
  IF (NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid')) OR
     (NEW.verification_status = 'verified' AND (OLD.verification_status IS NULL OR OLD.verification_status <> 'verified')) THEN
    IF NOT v_is_caller_admin THEN
      RAISE EXCEPTION 'QuickHire Security Violation: Only authorized administrators or verified automated settlement callbacks can mark payments as paid or verified.';
    END IF;
  END IF;

  -- Update timestamp automatically
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_payment_status_authorization ON public.payments;
CREATE TRIGGER trg_check_payment_status_authorization
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_status_authorization();

-- ----------------------------------------------------------------------------
-- SECTION 4: ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_events ENABLE ROW LEVEL SECURITY;

-- 4.1 Payments SELECT:
DROP POLICY IF EXISTS "Users can view payments they participated in" ON public.payments;
DROP POLICY IF EXISTS "Parties and admins can view payments" ON public.payments;
CREATE POLICY "Parties and admins can view payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = payer_id OR
    auth.uid() = payee_id OR
    public.is_admin(auth.uid())
  );

-- 4.2 Payments INSERT: Payers can create payment attempts
DROP POLICY IF EXISTS "Payers can record payments" ON public.payments;
DROP POLICY IF EXISTS "Payers can initiate payment attempts" ON public.payments;
CREATE POLICY "Payers can initiate payment attempts"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = payer_id AND
    (status IS NULL OR status IN ('created', 'pending')) AND
    (verification_status IS NULL OR verification_status = 'unverified')
  );

-- 4.3 Payments UPDATE: Payers can submit UTR or cancel; Admins can reconcile
DROP POLICY IF EXISTS "Payers can submit UTR and admins can reconcile" ON public.payments;
CREATE POLICY "Payers can submit UTR and admins can reconcile"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = payer_id OR
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = payer_id OR
    public.is_admin(auth.uid())
  );

-- 4.4 Audit Events SELECT:
DROP POLICY IF EXISTS "View audit events for permitted payments" ON public.payment_audit_events;
CREATE POLICY "View audit events for permitted payments"
  ON public.payment_audit_events FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_audit_events.payment_id
        AND (p.payer_id = auth.uid() OR p.payee_id = auth.uid())
    )
  );

-- 4.5 Audit Events INSERT:
DROP POLICY IF EXISTS "Insert audit events by authorized actors" ON public.payment_audit_events;
CREATE POLICY "Insert audit events by authorized actors"
  ON public.payment_audit_events FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = actor_id OR
    public.is_admin(auth.uid()) OR
    actor_id IS NULL
  );

-- ----------------------------------------------------------------------------
-- SECTION 5: ADMINISTRATIVE RECONCILIATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_payment_admin(
  p_payment_id uuid,
  p_new_status text,
  p_verification_status text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_uid uuid := auth.uid();
  v_old_payment public.payments%ROWTYPE;
BEGIN
  IF NOT public.is_admin(v_admin_uid) THEN
    RAISE EXCEPTION 'Access Denied: Only designated administrators can reconcile payment settlements.';
  END IF;

  SELECT * INTO v_old_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found: %', p_payment_id;
  END IF;

  -- Validate target status
  IF p_new_status NOT IN ('paid', 'pending', 'submitted', 'failed', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Invalid status transition requested: %', p_new_status;
  END IF;

  -- Update payment record
  UPDATE public.payments
  SET
    status = p_new_status,
    verification_status = p_verification_status,
    verification_notes = COALESCE(p_notes, verification_notes),
    verified_at = CASE WHEN p_verification_status = 'verified' THEN now() ELSE verified_at END,
    verified_by = v_admin_uid,
    updated_at = now()
  WHERE id = p_payment_id;

  -- Record audit event
  INSERT INTO public.payment_audit_events (
    payment_id,
    previous_status,
    new_status,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    p_payment_id,
    v_old_payment.status,
    p_new_status,
    'admin_reconciled',
    v_admin_uid,
    jsonb_build_object(
      'verification_status', p_verification_status,
      'notes', p_notes,
      'reconciled_by', v_admin_uid
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'status', p_new_status,
    'verification_status', p_verification_status
  );
END;
$$;
