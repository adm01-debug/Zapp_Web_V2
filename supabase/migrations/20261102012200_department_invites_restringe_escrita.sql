-- S3-01 (auditoria 2026-10-22): department_invites aceitava INSERT e DELETE de qualquer
-- usuario autenticado (dept_invites_insert_authenticated WITH CHECK true,
-- dept_invites_delete_authenticated USING true). O codigo do convite e credencial de
-- entrada no departamento.
--
-- Decisao do dono (01/11/2026): somente admin cria e apaga convites.
-- public.is_admin(uuid) = papel 'admin' em public.user_roles.
-- department_invites.created_by referencia profiles(id), nao auth.uid().
--
-- Rollback:
--   DROP POLICY dept_invites_insert_admin ON public.department_invites;
--   DROP POLICY dept_invites_delete_admin ON public.department_invites;
--   CREATE POLICY dept_invites_insert_authenticated ON public.department_invites
--     FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY dept_invites_delete_authenticated ON public.department_invites
--     FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;
DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;

CREATE POLICY "dept_invites_insert_admin" ON public.department_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND (
      created_by IS NULL
      OR created_by IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  );

CREATE POLICY "dept_invites_delete_admin" ON public.department_invites
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
