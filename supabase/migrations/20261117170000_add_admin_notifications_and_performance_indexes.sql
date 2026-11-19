-- ==============================================================================
-- QuickHire Forward-Only Database Migration: Admin Notifications & Performance Indexes
-- Migration: 20261117170000_add_admin_notifications_and_performance_indexes.sql
-- Description:
--   1. Creates the authoritative public.admin_notifications table with strict
--      administrator-only Row Level Security (RLS) policies.
--   2. Adds critical composite and foreign key indexes to optimize performance
--      for job applications, payment tracking, and citizen complaints.
--
-- Safety Guarantees:
--   - Strictly additive: No existing tables, records, or columns dropped or mutated.
--   - Idempotent: Safe to re-run across Staging and Production databases.
-- ==============================================================================

BEGIN;

-- 1. AUTHORITATIVE ADMIN NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('system', 'alert', 'info', 'warning', 'dispute', 'payment', 'security', 'worker_claim')),
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Drop prior policies if existing (idempotency)
DROP POLICY IF EXISTS admin_notifications_select_admin ON public.admin_notifications;
DROP POLICY IF EXISTS admin_notifications_update_admin ON public.admin_notifications;
DROP POLICY IF EXISTS admin_notifications_insert_admin_or_service ON public.admin_notifications;

-- Strict Administrator-Only Access Policies
CREATE POLICY admin_notifications_select_admin ON public.admin_notifications
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY admin_notifications_update_admin ON public.admin_notifications
    FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY admin_notifications_insert_admin_or_service ON public.admin_notifications
    FOR INSERT TO authenticated, service_role
    WITH CHECK (public.is_admin(auth.uid()) OR auth.role() = 'service_role');

-- Revoke permissions from public/anon and grant to authenticated admins & service_role
REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.admin_notifications TO authenticated;
GRANT ALL ON TABLE public.admin_notifications TO service_role;

COMMENT ON TABLE public.admin_notifications IS 'System and governance alerts accessible exclusively to verified administrators and service_role.';

-- 2. CITIZEN COMPLAINTS & GRIEVANCE MANAGEMENT TABLE (Idempotent Schema Guard)
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reporter_phone TEXT,
    reporter_name TEXT,
    target_type TEXT NOT NULL CHECK (target_type IN ('worker', 'employer', 'job', 'equipment', 'payment', 'platform', 'other')),
    target_id TEXT,
    target_name TEXT,
    category TEXT NOT NULL CHECK (category IN ('unpaid_wages', 'unsafe_conditions', 'harassment', 'fraud', 'misleading_equipment', 'platform_abuse', 'other')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'investigating', 'resolved', 'dismissed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    assigned_to TEXT,
    resolution_notes TEXT,
    evidence_urls TEXT[] DEFAULT '{}'::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Complaints read policy" ON public.complaints;
CREATE POLICY "Complaints read policy" ON public.complaints
    FOR SELECT TO authenticated
    USING (auth.uid() = reporter_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Complaints insert policy" ON public.complaints;
CREATE POLICY "Complaints insert policy" ON public.complaints
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Complaints update policy" ON public.complaints;
CREATE POLICY "Complaints update policy" ON public.complaints
    FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

REVOKE ALL ON TABLE public.complaints FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.complaints TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.complaints TO authenticated;
GRANT ALL ON TABLE public.complaints TO service_role;

-- 3. HIGH-PERFORMANCE QUERY INDEXES
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_records_worker_status ON public.job_records (worker_id, status);
CREATE INDEX IF NOT EXISTS idx_job_records_job_status ON public.job_records (job_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_payee_status ON public.payments (payee_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_reference_id ON public.payments (reference_id);
CREATE INDEX IF NOT EXISTS idx_complaints_target ON public.complaints (target_type, target_id);

COMMIT;
