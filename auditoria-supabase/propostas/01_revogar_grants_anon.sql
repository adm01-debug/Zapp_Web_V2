-- ============================================================
-- PROPOSTA 01 — Revogar grants de escrita de anon em 99 tabelas
-- Status: NOT APPLIED
-- Severidade: CRITICAL-1
-- Evidência: auditoria 2026-10-24
--
-- Contexto:
--   99 tabelas têm GRANT INSERT/UPDATE/DELETE/TRUNCATE para o
--   role 'anon'. Se qualquer política RLS for mal configurada
--   (USING(true), permissão acidental) essas tabelas ficam
--   abertas para escrita não autenticada. O princípio de menor
--   privilégio exige que anon só tenha SELECT onde explicitamente
--   necessário.
--
-- Efeito: reduz a superfície de ataque sem quebrar nenhuma
--   funcionalidade legítima (anon nunca precisa escrever
--   diretamente em tabelas de aplicação — usa edge functions
--   com service_role).
--
-- Rollback: seção ROLLBACK no final deste arquivo.
-- ============================================================

BEGIN;

-- Revogar todos os grants de escrita para anon no schema public
-- (preserva SELECT onde necessário)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- Verificar que a revogação foi aplicada (deve retornar 0):
-- SELECT count(*) FROM information_schema.role_table_grants
-- WHERE grantee = 'anon'
--   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
--   AND table_schema = 'public';

COMMIT;

-- ============================================================
-- ROLLBACK (executar se necessário reverter)
-- ============================================================
-- IMPORTANTE: o rollback abaixo devolve os grants para TODAS
-- as tabelas do schema public, que é mais permissivo que o
-- estado original (onde eram 99 tabelas específicas).
-- Para rollback preciso, restaurar a partir do snapshot de
-- grants gerado durante a auditoria.
-- ============================================================

-- ROLLBACK:
-- BEGIN;
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO anon;
-- COMMIT;
