-- PROPOSTA P001 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: public.department_invites (policies DELETE e INSERT)
-- Problema: Policies DELETE e INSERT com qual/with_check='true' permitem que qualquer usuário
--   autenticado delete convites de departamento alheios e crie convites para qualquer departamento
--   sem restrição de ownership.
--
--   Evidência:
--     policyname='dept_invites_delete_authenticated' cmd=DELETE qual='true' roles=[authenticated]
--     policyname='dept_invites_insert_authenticated' cmd=INSERT with_check='true' roles=[authenticated]
--
-- Impacto se não corrigido: Comprometimento do controle de acesso para gerenciamento de equipes —
--   qualquer usuário pode deletar convites pendentes de outros departamentos ou criar convites
--   fraudulentos.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "dept_invites_delete_restricted" ON public.department_invites;
--   DROP POLICY IF EXISTS "dept_invites_insert_restricted" ON public.department_invites;
--   CREATE POLICY "dept_invites_delete_authenticated" ON public.department_invites
--     FOR DELETE TO authenticated USING (true);
--   CREATE POLICY "dept_invites_insert_authenticated" ON public.department_invites
--     FOR INSERT TO authenticated WITH CHECK (true);
--
-- ATENÇÃO: Confirmar os nomes exatos das policies e a estrutura da tabela antes de aplicar.
--   Verificar se a coluna de ownership é 'created_by' ou 'invited_by' via:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='department_invites' AND column_name ILIKE '%created%' OR column_name ILIKE '%invited%';

-- Passo 1: remover policies permissivas existentes
DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;
DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;

-- Passo 2: criar policy de DELETE restrita a admin/supervisor ou criador do convite
-- (ajustar nome da coluna de ownership conforme schema real)
CREATE POLICY "dept_invites_delete_restricted"
  ON public.department_invites
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_admin_or_supervisor()
  );

-- Passo 3: criar policy de INSERT restrita a admin/supervisor
-- (somente admins/supervisores podem criar convites de departamento)
CREATE POLICY "dept_invites_insert_restricted"
  ON public.department_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_or_supervisor()
    AND created_by = auth.uid()
  );
