-- P001: Correção de policies RLS de department_invites
-- Achados: S3-01 (DELETE USING true) e S3-02 (INSERT WITH CHECK true)
-- Status: migration 20261026100300_dept_invites_ownership_fix.sql em PR #2186

-- VULNERABILIDADE CONFIRMADA em Postgres local (zapp_s11_final, 2026-10-22):
--   C3a: Agente B deletou convite de A (DELETE 1) — política OLD com USING(true)
--   C3b: Correção NEW impede deleção por B (DELETE 0) ← esta migration
--   C3c: Agente B bloqueado de INSERT (ERROR RLS) ← esta migration
--   C3d: Admin C pode fazer INSERT (INSERT 0 1) ← correto

-- === APPLY ===

-- Política 1 (DELETE): apenas o criador pode deletar seu próprio convite
DROP POLICY IF EXISTS dept_invites_delete_authenticated ON public.department_invites;
CREATE POLICY dept_invites_delete_owner
  ON public.department_invites
  FOR DELETE
  USING (
    invited_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );

-- Política 2 (INSERT): apenas admin ou supervisor pode criar convites
DROP POLICY IF EXISTS dept_invites_insert_authenticated ON public.department_invites;
CREATE POLICY dept_invites_insert_admin_supervisor
  ON public.department_invites
  FOR INSERT
  WITH CHECK (
    is_admin_or_supervisor()
    AND invited_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );

-- === ROLLBACK (se necessário reverter) ===
-- DROP POLICY IF EXISTS dept_invites_delete_owner ON public.department_invites;
-- DROP POLICY IF EXISTS dept_invites_insert_admin_supervisor ON public.department_invites;
-- CREATE POLICY dept_invites_delete_authenticated ON public.department_invites FOR DELETE USING (true);
-- CREATE POLICY dept_invites_insert_authenticated ON public.department_invites FOR INSERT WITH CHECK (true);

-- === VERIFICAÇÃO ===
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'department_invites';
-- Esperado: dept_invites_delete_owner (DELETE) + dept_invites_insert_admin_supervisor (INSERT)
