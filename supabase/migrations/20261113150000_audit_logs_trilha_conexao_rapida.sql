-- 20261113150000_audit_logs_trilha_conexao_rapida
--
-- PRECISA DE APROVAÇÃO DO DONO ANTES DE APLICAR EM PRODUÇÃO.
--
-- Sintoma (13/11/2026, produção): a trilha de auditoria da conexão
-- (ConnectionAuditDialog → useConnectionAuditLogs) faz
--   GET rest/v1/audit_logs?select=id,action,user_id,created_at
--       &details=cs.{"instance_id":"PRINCIPAL"}&order=created_at.desc&limit=20
--   (com count=exact) → HTTP 500.
--
-- Medição (MCP read-only, EXPLAIN ANALYZE, 13/11 ~19h UTC; 89.124 linhas, 38 MB):
--   * sem índice para `details`: Seq Scan nas 89.124 linhas, 1,99 s a frio
--     (33 ms a quente) só para o filtro `details @> ...`;
--   * a policy de SELECT "Only admins can view audit logs" é
--     `has_role(auth.uid(), 'admin')` — função SECURITY DEFINER (não é
--     embutida pelo planner) avaliada LINHA A LINHA. Forçando a ordem que a RLS
--     impõe (o `@>` não é leakproof, então roda DEPOIS da policy), a mesma
--     consulta passou de 33 ms para 1,30 s só pelas 89.124 chamadas de
--     has_role — sem contar o auth.uid() (current_setting + parse do JWT) por
--     linha, nem a segunda varredura do count=exact.
--   * o papel `authenticated` tem statement_timeout=8s: a frio, com as duas
--     varreduras (página + count) e o custo por linha da policy, a consulta
--     encosta no limite e o PostgREST devolve 500 (57014).
--   Não foi possível rodar o EXPLAIN como `authenticated` pelo MCP (SET ROLE
--   é recusado dentro da função security definer) — o número exato sob RLS
--   fica para conferir depois de aplicar.
--
-- Correção (2 partes, ambas idempotentes):
--   1) Policy de SELECT com initplan: `(select has_role((select auth.uid()), ...))`
--      é avaliada UMA vez por consulta (padrão "auth_rls_initplan" do advisor do
--      Supabase). Mesma regra de acesso (só admin), mesmo nome, mesmo papel.
--   2) Índice GIN jsonb_path_ops em `details`: atende `details @> {...}` (o
--      operador que o `.contains()` do supabase-js gera). Com a policy virando
--      filtro constante (initplan), o `@>` deixa de esperar a policy linha a
--      linha e pode usar o índice.
--
-- CONCURRENTLY não é usado: o pipeline de migration roda dentro de transação
-- (mesmo padrão de 20260924225551_add_messages_perf_indexes.sql). Tabela pequena
-- (89 mil linhas / 38 MB) → lock breve do CREATE INDEX. Se preferir zero lock,
-- aplicar manualmente fora de transação:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_details_path_ops
--     ON public.audit_logs USING gin (details jsonb_path_ops);
--
-- Reversão:
--   DROP INDEX IF EXISTS public.idx_audit_logs_details_path_ops;
--   DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs;
--   CREATE POLICY "Only admins can view audit logs" ON public.audit_logs
--     FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Only admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

CREATE INDEX IF NOT EXISTS idx_audit_logs_details_path_ops
  ON public.audit_logs USING gin (details jsonb_path_ops);
