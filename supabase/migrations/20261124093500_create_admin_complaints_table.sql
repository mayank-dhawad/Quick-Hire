-- Complaints are an administrator-managed case register.
-- Citizen contact and case details are never exposed to ordinary app users.
BEGIN;

CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_phone text,
  reporter_name text,
  target_type text NOT NULL DEFAULT 'other'
    CHECK (target_type IN ('worker','employer','job','equipment','payment','platform','other')),
  target_id text,
  target_name text,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('unpaid_wages','unsafe_conditions','harassment','fraud','misleading_equipment','platform_abuse','other')),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  description text NOT NULL CHECK (char_length(btrim(description)) > 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','investigating','resolved','dismissed')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  evidence_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_complaints_status_priority_created
  ON public.complaints (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_reporter_id
  ON public.complaints (reporter_id);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_to
  ON public.complaints (assigned_to);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Complaints are admin managed" ON public.complaints;
CREATE POLICY "Complaints are admin managed"
  ON public.complaints
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;
REVOKE DELETE ON public.complaints FROM authenticated;
REVOKE ALL ON public.complaints FROM anon;

COMMENT ON TABLE public.complaints IS
  'Administrator-only grievance case register. Reporter identity and complaint evidence are restricted to authorized administrators.';

COMMIT;
