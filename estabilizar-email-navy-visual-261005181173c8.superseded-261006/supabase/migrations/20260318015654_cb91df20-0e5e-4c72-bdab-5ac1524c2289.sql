
-- Fix scheduled_report_configs: split ALL policy into specific operations with proper WITH CHECK
DROP POLICY IF EXISTS "Admin/supervisor can manage report configs" ON public.scheduled_report_configs;

CREATE POLICY "Admin/supervisor can insert report configs"
  ON public.scheduled_report_configs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admin/supervisor can update report configs"
  ON public.scheduled_report_configs FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admin/supervisor can delete report configs"
  ON public.scheduled_report_configs FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
