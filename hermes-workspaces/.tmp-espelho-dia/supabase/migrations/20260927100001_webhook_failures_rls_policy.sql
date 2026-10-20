-- Cria policy RLS service_role_full em webhook_failures.
-- A tabela existe com RLS habilitado mas sem nenhuma policy, fazendo o
-- guard check-webhook-failures-acl.sql falhar (policy_exact = false).
CREATE POLICY service_role_full ON public.webhook_failures
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
