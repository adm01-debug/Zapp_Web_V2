SET LOCAL lock_timeout = '3s'

DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs

CREATE POLICY "Only admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))

CREATE INDEX IF NOT EXISTS idx_audit_logs_details_path_ops
  ON public.audit_logs USING gin (details jsonb_path_ops)
