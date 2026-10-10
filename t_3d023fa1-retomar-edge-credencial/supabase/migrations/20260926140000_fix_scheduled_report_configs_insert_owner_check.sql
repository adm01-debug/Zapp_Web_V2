-- Fecha lacuna encontrada em auditoria de segurança (2026-09-26): a policy de
-- INSERT do E40 (20260926113806_scheduled_report_configs_owner_only.sql) só
-- checava is_admin_or_supervisor(), sem restringir o valor de created_by que o
-- cliente envia. Um supervisor podia inserir created_by = profile de outra
-- pessoa (o trigger só preenche created_by quando vem NULL), plantando um
-- registro "possuído" por quem não o criou.
DROP POLICY IF EXISTS "Admin/supervisor can insert report configs" ON public.scheduled_report_configs;

CREATE POLICY "Admin/supervisor can insert report configs"
  ON public.scheduled_report_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR created_by IS NULL
      OR created_by = public.get_profile_id_for_user(auth.uid())
    )
  );
