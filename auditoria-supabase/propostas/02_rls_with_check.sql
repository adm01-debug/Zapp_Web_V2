-- ============================================================
-- PROPOSTA 02 — Adicionar WITH CHECK a políticas UPDATE sem ele
-- Status: NOT APPLIED
-- Severidade: HIGH-2
-- Evidência: auditoria 2026-10-24
--
-- Contexto:
--   39 políticas UPDATE têm USING mas não têm WITH CHECK.
--   Isso permite que uma linha seja atualizada para um estado
--   que o usuário não poderia ver, quebrando a invariante de
--   RLS. Exemplo: um agente pode reassinar uma conversa para
--   outro account mesmo que a policy USING só permita ver
--   suas próprias conversas.
--
-- Abordagem: para cada política afetada, recriar com
--   WITH CHECK igual ao USING (postura conservadora —
--   pode ser mais restritiva que o necessário em alguns casos;
--   revisar por tabela antes de aplicar em produção).
--
-- Este arquivo contém a lógica geral; as políticas exatas
-- precisam ser verificadas individualmente com:
--   SELECT schemaname, tablename, policyname, qual, with_check
--   FROM pg_policies
--   WHERE cmd = 'UPDATE' AND with_check IS NULL
--   AND schemaname = 'public';
--
-- Rollback: DROP POLICY + CREATE POLICY sem WITH CHECK.
-- ============================================================

-- TEMPLATE para cada política afetada:
-- BEGIN;
-- DROP POLICY "<policy_name>" ON public.<table_name>;
-- CREATE POLICY "<policy_name>" ON public.<table_name>
--   FOR UPDATE
--   USING (<condicao_original>)
--   WITH CHECK (<mesma_condicao_original>);
-- COMMIT;

-- Exemplo para uma política hipotética "agents_update_own":
-- BEGIN;
-- DROP POLICY "agents_update_own" ON public.conversations;
-- CREATE POLICY "agents_update_own" ON public.conversations
--   FOR UPDATE
--   USING (assigned_agent_id = auth.uid())
--   WITH CHECK (assigned_agent_id = auth.uid());
-- COMMIT;

-- ============================================================
-- ROLLBACK — reverter as políticas para o estado sem WITH CHECK
-- (executar por tabela; substituir <policy_name>, <table_name>
--  e <condicao_original> pelos valores reais da tabela alvo)
-- ============================================================

-- Padrão para reverter UMA política:
BEGIN;

-- Passo 1: recriar sem WITH CHECK (rollback de uma política)
-- DROP POLICY "<policy_name>" ON public.<table_name>;
-- CREATE POLICY "<policy_name>" ON public.<table_name>
--   FOR UPDATE
--   USING (<condicao_original>);

-- Verificação pós-rollback (deve retornar 1 linha com with_check IS NULL):
-- SELECT tablename, policyname, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = '<table_name>'
--   AND policyname = '<policy_name>';

COMMIT;

-- Nota: com 39 políticas afetadas, o rollback completo requer
-- executar o padrão acima para cada tabela. A query de
-- verificação pré-aplicação (no final deste arquivo) lista
-- todas as políticas afetadas com suas condições USING originais.

-- Verificação pré-aplicação (executar antes de qualquer mudança):
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE cmd = 'UPDATE'
  AND with_check IS NULL
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- Verificação pós-aplicação (deve retornar 0):
-- SELECT count(*) FROM pg_policies
-- WHERE cmd = 'UPDATE' AND with_check IS NULL AND schemaname = 'public';
