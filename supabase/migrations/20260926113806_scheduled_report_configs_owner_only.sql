-- E40 (decisão de Joaquim, 26/09/2026): scheduled_report_configs vira owner-only.
-- Antes: staff-wide — qualquer admin/supervisor via/editava config de relatório de
-- qualquer outro supervisor (created_by existia mas nenhuma policy o usava).
-- Agora: supervisor só vê/edita/apaga as próprias configs; admin continua vendo tudo
-- (papel de supervisão). row_count=0 em produção — sem dado legado a migrar.

-- Trigger: garante created_by sempre populado no INSERT (client não precisa mudar
-- para enviar o campo — mesmo padrão de get_profile_id_for_user usado no fix do P0
-- de UUID do dashboard, 25/09/2026).
CREATE OR REPLACE FUNCTION public.set_scheduled_report_config_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := public.get_profile_id_for_user(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_scheduled_report_config_owner ON public.scheduled_report_configs;
CREATE TRIGGER trg_set_scheduled_report_config_owner
  BEFORE INSERT ON public.scheduled_report_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_scheduled_report_config_owner();

-- Policies: DROP das 4 staff-wide, CREATE das 4 owner-only (admin vê/edita tudo).
DROP POLICY IF EXISTS "Admins can read report configs" ON public.scheduled_report_configs;
DROP POLICY IF EXISTS "Admin/supervisor can insert report configs" ON public.scheduled_report_configs;
DROP POLICY IF EXISTS "Admin/supervisor can update report configs" ON public.scheduled_report_configs;
DROP POLICY IF EXISTS "Admin/supervisor can delete report configs" ON public.scheduled_report_configs;

CREATE POLICY "Owner or admin can read report configs"
  ON public.scheduled_report_configs
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR created_by = public.get_profile_id_for_user(auth.uid())
  );

CREATE POLICY "Admin/supervisor can insert report configs"
  ON public.scheduled_report_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Owner or admin can update report configs"
  ON public.scheduled_report_configs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR created_by = public.get_profile_id_for_user(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR created_by = public.get_profile_id_for_user(auth.uid())
  );

CREATE POLICY "Owner or admin can delete report configs"
  ON public.scheduled_report_configs
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR created_by = public.get_profile_id_for_user(auth.uid())
  );
