
-- Fix overly permissive insert policy on connection_health_logs
DROP POLICY IF EXISTS "Service can insert health logs" ON public.connection_health_logs;

-- Fix overly permissive insert policy on webhook_rate_limits  
CREATE POLICY "Admins can insert rate limits" ON public.webhook_rate_limits
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Allow delete for cleanup
CREATE POLICY "Admins can delete rate limits" ON public.webhook_rate_limits
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can delete health logs" ON public.connection_health_logs
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
