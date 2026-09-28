-- E15: DROP TABLE department_invites (duplicata sem dados) + fix department_audit_logs
-- department_invites (plural) e duplicata nao-usada com 0 linhas e policies abertas (USING(true))
-- department_audit_logs tinha INSERT/SELECT abertos para todo authenticated

-- Drop policies abertas de department_invites
DROP POLICY IF EXISTS "Department admins can manage invites" ON public.department_invites;
DROP POLICY IF EXISTS "Users can view own invites" ON public.department_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.department_invites;

-- Drop a tabela duplicata
DROP TABLE IF EXISTS public.department_invites;

-- Fix department_audit_logs: INSERT deve ser apenas via funcoes SECURITY DEFINER
-- SELECT apenas para membros do departamento ou admins
REVOKE ALL ON TABLE public.department_audit_logs FROM authenticated;

GRANT SELECT ON TABLE public.department_audit_logs TO authenticated;

-- Apenas admins podem ler logs de auditoria
DROP POLICY IF EXISTS "Authenticated users can read audit logs" ON public.department_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.department_audit_logs;
DROP POLICY IF EXISTS "Anyone can insert audit log" ON public.department_audit_logs;

CREATE POLICY "Admins and supervisors can read audit logs"
  ON public.department_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    )
  );

-- INSERT apenas via service_role (funcoes SECURITY DEFINER inserem como service_role)
REVOKE INSERT ON TABLE public.department_audit_logs FROM authenticated;
