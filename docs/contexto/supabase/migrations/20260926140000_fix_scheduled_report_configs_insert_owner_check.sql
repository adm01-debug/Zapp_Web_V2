DROP POLICY IF EXISTS "Admin/supervisor can insert report configs" ON public.scheduled_report_configs

CREATE POLICY "Admin/supervisor can insert report configs" ON public.scheduled_report_configs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()) AND (public.is_admin(auth.uid()) OR created_by IS NULL OR created_by = public.get_profile_id_for_user(auth.uid())))
