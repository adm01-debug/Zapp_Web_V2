DROP POLICY IF EXISTS dept_invites_select_authenticated ON public.department_invites;
CREATE POLICY dept_invites_select_authenticated ON public.department_invites FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dept_invites_insert_authenticated ON public.department_invites;
CREATE POLICY dept_invites_insert_authenticated ON public.department_invites FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS dept_invites_delete_authenticated ON public.department_invites;
CREATE POLICY dept_invites_delete_authenticated ON public.department_invites FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS dept_audit_select_authenticated ON public.department_audit_logs;
CREATE POLICY dept_audit_select_authenticated ON public.department_audit_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dept_audit_insert_authenticated ON public.department_audit_logs;
CREATE POLICY dept_audit_insert_authenticated ON public.department_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
