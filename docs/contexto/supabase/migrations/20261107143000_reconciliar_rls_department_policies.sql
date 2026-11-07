DROP POLICY IF EXISTS dept_invites_insert_authenticated ON public.department_invites

DROP POLICY IF EXISTS dept_invites_insert_admin ON public.department_invites

CREATE POLICY dept_invites_insert_admin ON public.department_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    AND (
      created_by IS NULL
      OR created_by IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
  )

DROP POLICY IF EXISTS dept_invites_delete_authenticated ON public.department_invites

DROP POLICY IF EXISTS dept_invites_delete_admin ON public.department_invites

CREATE POLICY dept_invites_delete_admin ON public.department_invites
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()))

DROP POLICY IF EXISTS dept_audit_select_authenticated ON public.department_audit_logs

DROP POLICY IF EXISTS dept_audit_insert_authenticated ON public.department_audit_logs

DROP POLICY IF EXISTS dept_audit_select_own_dept ON public.department_audit_logs

CREATE POLICY dept_audit_select_own_dept ON public.department_audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = current_profile_id()
        AND p.department_id = department_audit_logs.department_id
        AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])
    )
  )
