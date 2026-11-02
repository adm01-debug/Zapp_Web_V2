-- S3-01 (auditoria 2026-10-22): department_invites aceitava INSERT e DELETE de qualquer
-- usuario autenticado (dept_invites_insert_authenticated WITH CHECK true,
-- dept_invites_delete_authenticated USING true). O codigo do convite e credencial de
-- entrada no departamento.
--
-- department_invites.created_by referencia profiles(id), nao auth.uid().
-- Permissao de gestao segue o padrao da RPC set_department_whatsapp_config:
-- public.is_admin_or_supervisor(auth.uid()).
--
-- Rollback:
--   DROP POLICY dept_invites_insert_admin ON public.department_invites;
--   DROP POLICY dept_invites_delete_owner_or_admin ON public.department_invites;
--   CREATE POLICY dept_invites_insert_authenticated ON public.department_invites
--     FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY dept_invites_delete_authenticated ON public.department_invites
--     FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;
DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;

CREATE POLICY "dept_invites_insert_admin" ON public.department_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND (
      created_by IS NULL
      OR created_by IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  );

CREATE POLICY "dept_invites_delete_owner_or_admin" ON public.department_invites
  FOR DELETE TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR created_by IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
