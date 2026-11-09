SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "dept_invites_insert_admin" ON public.department_invitations;
CREATE POLICY "dept_invites_insert_admin"
ON public.department_invitations FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_supervisor((SELECT auth.uid())));

DROP POLICY IF EXISTS "dept_invites_delete_admin" ON public.department_invitations;
CREATE POLICY "dept_invites_delete_admin"
ON public.department_invitations FOR DELETE TO authenticated
USING (public.is_admin_or_supervisor((SELECT auth.uid())));

DROP POLICY IF EXISTS "dept_audit_select_own_dept" ON public.department_audit_log;
CREATE POLICY "dept_audit_select_own_dept"
ON public.department_audit_log FOR SELECT TO authenticated
USING (
  department_id IN (
    SELECT qm.queue_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE p.user_id = (SELECT auth.uid())
  )
  OR public.is_admin_or_supervisor((SELECT auth.uid()))
);
