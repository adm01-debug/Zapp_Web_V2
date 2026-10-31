-- Auditoria 2026-10-22 S3-01: policies DELETE/INSERT sem ownership em department_invites
-- DELETE pol tinha qual='true' — qualquer autenticado deletava convites alheios.
-- INSERT pol tinha with_check='true' — qualquer autenticado criava convites sem restrição.
--
-- Notas de correção (v2):
-- 1. is_admin_or_supervisor() exige argumento uuid — usar public.is_admin_or_supervisor(auth.uid()).
-- 2. department_invites.created_by referencia profiles.id (FK), NÃO auth.uid() diretamente
--    (profiles.id ≠ profiles.user_id; user_id é o auth UID).
--    Comparar criador via subquery: SELECT id FROM profiles WHERE user_id = auth.uid().

DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;
DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;

CREATE POLICY "dept_invites_delete_restricted"
  ON public.department_invites
  FOR DELETE
  TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "dept_invites_insert_restricted"
  ON public.department_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );
