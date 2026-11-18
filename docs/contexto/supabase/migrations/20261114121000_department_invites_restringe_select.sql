-- QA (varredura 2026-11-14): department_invites.dept_invites_select_authenticated
-- (20260927520000_add_department_rls_policies.sql:1) ficou com USING(true) para
-- authenticated: qualquer usuario autenticado le os codigos de convite de QUALQUER
-- departamento. A migration 20261102012200_department_invites_restringe_escrita.sql
-- ja trocou INSERT/DELETE desta mesma tabela para admin (decisao do dono: so admin
-- cria e apaga convites), mas deixou o SELECT esquecido em aberto.
--
-- Confirmado abandono de leitura pelo app: grep em src/ e supabase/functions/ nao
-- acha nenhum `.from('department_invites')`; o aceite usa a RPC
-- accept_department_invite (SECURITY DEFINER) sobre department_invitations, e a
-- criacao usa create_department_invite (SECURITY DEFINER) tambem sobre
-- department_invitations (ver comentario de 20261102012200). Mesmo assim, em vez de
-- confiar em "ninguem le mesmo", a policy passa a exigir admin, no mesmo padrao
-- das policies de escrita ja restritas nesta tabela.
--
-- Rollback:
--   DROP POLICY IF EXISTS "dept_invites_select_admin" ON public.department_invites;
--   CREATE POLICY dept_invites_select_authenticated ON public.department_invites
--     FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_invites_select_authenticated" ON public.department_invites

CREATE POLICY "dept_invites_select_admin" ON public.department_invites
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()))
