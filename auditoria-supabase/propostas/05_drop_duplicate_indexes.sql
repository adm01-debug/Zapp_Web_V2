-- ============================================================
-- PROPOSTA 05 — Remover índices duplicados/redundantes
-- Status: NOT APPLIED
-- Severidade: MEDIUM-6
-- Evidência: auditoria 2026-10-24
--
-- Contexto:
--   Índices onde as colunas são subconjunto de outro índice
--   existente, ou índices idênticos (mesmo set de colunas).
--   Redundâncias consomem espaço e aumentam overhead de escrita.
--
-- Verificação de duplicatas exatas ao vivo:
-- ============================================================

-- Identificar duplicatas exatas:
SELECT
  a.indexname AS index_a,
  b.indexname AS index_b,
  a.tablename,
  a.indexdef
FROM pg_indexes a
JOIN pg_indexes b
  ON a.tablename = b.tablename
  AND a.indexdef = b.indexdef
  AND a.indexname < b.indexname
WHERE a.schemaname = 'public'
ORDER BY a.tablename, a.indexname;

-- Identificar índices prefixo (A é prefixo de B — remover A):
SELECT
  i1.relname AS index_prefix,
  i2.relname AS index_full,
  t.relname AS table_name,
  pg_size_pretty(pg_relation_size(i1.oid)) AS size_to_free
FROM pg_index ix1
JOIN pg_index ix2 ON ix1.indrelid = ix2.indrelid
  AND ix1.indrelid != ix2.indrelid
  AND ix1.oid != ix2.oid
JOIN pg_class i1 ON i1.oid = ix1.indexrelid
JOIN pg_class i2 ON i2.oid = ix2.indexrelid
JOIN pg_class t ON t.oid = ix1.indrelid
WHERE ix1.indisunique = FALSE
  AND ix2.indisunique = FALSE
  AND array_length(ix1.indkey, 1) < array_length(ix2.indkey, 1)
  AND ix1.indkey::text = left(ix2.indkey::text,
    array_length(ix1.indkey,1) * 2 - 1)
LIMIT 20;

-- TEMPLATE para remoção:
-- BEGIN;
-- DROP INDEX IF EXISTS public.<index_name>;
-- COMMIT;

-- Rollback template:
-- BEGIN;
-- CREATE INDEX <index_name> ON public.<table_name>(<colunas>);
-- COMMIT;
