-- Auditoria 2026-10-22 S3-01: policies DELETE/INSERT sem ownership em department_invites
-- DELETE pol tinha qual='true' — qualquer autenticado deletava convites alheios.
-- INSERT pol tinha with_check='true' — qualquer autenticado criava convites sem restrição.

DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;
DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;

CREATE POLICY "dept_invites_delete_restricted"
  ON public.department_invites
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_admin_or_supervisor()
  );

CREATE POLICY "dept_invites_insert_restricted"
  ON public.department_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_or_supervisor()
    AND created_by = auth.uid()
  );
