-- ============================================================
-- PROPOSTA 04 — Criar índices em FKs sem índice
-- Status: NOT APPLIED
-- Severidade: HIGH-3
-- Evidência: auditoria 2026-10-24
--
-- Contexto:
--   35 colunas de chave estrangeira não têm índice.
--   Isso causa seq scan na tabela filho a cada:
--   - DELETE/UPDATE na tabela pai (FK check)
--   - JOIN pela FK
--   - CASCADE ou SET NULL trigger
--
-- Impacto maior em tabelas com volume alto:
--   messages, conversations, events — operações frequentes
--   geram seq scans caros.
--
-- Verificação prévia (executar antes de criar):
--   Ver pg_stat_user_tables.seq_scan para as tabelas afetadas.
--
-- Rollback: DROP INDEX para cada índice criado.
-- NOTA: usar CREATE INDEX simples (sem CONCURRENTLY) —
--   gateway envolve em transação, CONCURRENTLY falha.
-- ============================================================

-- Identificar FKs sem índice ao vivo:
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index pi
    JOIN pg_attribute pa ON pa.attrelid = pi.indrelid
      AND pa.attnum = ANY(pi.indkey)
    WHERE pi.indrelid = (tc.table_schema || '.' || tc.table_name)::regclass
      AND pa.attname = kcu.column_name
  )
ORDER BY tc.table_name, kcu.column_name;

-- TEMPLATE para cada FK sem índice:
-- BEGIN;
-- CREATE INDEX idx_<table>_<column>
--   ON public.<table_name>(<column_name>);
-- COMMIT;

-- Rollback template:
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_<table>_<column>;
-- COMMIT;
