-- Isolated CRM-style dashboard snapshots for HQ staff portal preview only.
-- Real clients continue to use CRM tables scoped by tenant_id.

CREATE TABLE public.portal_hq_dashboard_sandbox (
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE PRIMARY KEY,
    payload jsonb NOT NULL DEFAULT '{"activities":[],"hotContacts":[],"tasks":[]}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.portal_hq_dashboard_sandbox IS
  'Scratch data for HQ users testing the Portal home dashboard UI without touching tenant CRM rows.';

CREATE INDEX portal_hq_dashboard_sandbox_updated_at_idx
  ON public.portal_hq_dashboard_sandbox (updated_at DESC);

ALTER TABLE public.portal_hq_dashboard_sandbox ENABLE ROW LEVEL SECURITY;

-- Only Chaster HQ staff may use this sandbox; scoped to own user_id.
CREATE POLICY portal_hq_dashboard_sandbox_select ON public.portal_hq_dashboard_sandbox
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_chaster_staff()
  );

CREATE POLICY portal_hq_dashboard_sandbox_insert ON public.portal_hq_dashboard_sandbox
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_chaster_staff()
  );

CREATE POLICY portal_hq_dashboard_sandbox_update ON public.portal_hq_dashboard_sandbox
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_chaster_staff()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_chaster_staff()
  );

CREATE POLICY portal_hq_dashboard_sandbox_delete ON public.portal_hq_dashboard_sandbox
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_chaster_staff()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_hq_dashboard_sandbox TO authenticated;
GRANT ALL ON public.portal_hq_dashboard_sandbox TO service_role;
