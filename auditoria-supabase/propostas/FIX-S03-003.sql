-- FIX-S03-003: department_invites DELETE — qualquer autenticado deleta qualquer convite
-- Problema: Policy `dept_invites_delete_authenticated` usa USING (true) sem restricao.
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM

BEGIN;

-- Verificar policy atual antes de alterar:
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'department_invites' AND policyname = 'dept_invites_delete_authenticated';

-- Drop da policy permissiva:
DROP POLICY IF EXISTS dept_invites_delete_authenticated ON public.department_invites;

-- Nova policy: apenas quem criou o convite ou admin/supervisor pode deletar
CREATE POLICY dept_invites_delete_restricted ON public.department_invites
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_admin_or_supervisor()
  );

-- Verificacao:
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'department_invites'
ORDER BY cmd;

COMMIT;

-- ROLLBACK:
/*
BEGIN;
DROP POLICY IF EXISTS dept_invites_delete_restricted ON public.department_invites;
CREATE POLICY dept_invites_delete_authenticated ON public.department_invites
  FOR DELETE USING (true);
COMMIT;
*/

-- RISCO DE REGRESSAO: BAIXO
