-- ============================================================
-- PROPOSTA 03 — Remover índices trigram não utilizados
-- Status: NOT APPLIED
-- Severidade: MEDIUM-5
-- Evidência: auditoria 2026-10-24
--
-- Contexto:
--   38MB+ em índices GIN/trigram (pg_trgm) com idx_scan = 0
--   ou uso insignificante nos últimos 30 dias. Índices não
--   utilizados consomem espaço em disco, aumentam tempo de
--   escrita e são varridos pelo autovacuum desnecessariamente.
--
-- Candidatos identificados (verificar idx_scan ao vivo antes
-- de aplicar):
--   SELECT indexname, tablename, pg_size_pretty(pg_relation_size(indexname::regclass)) AS tamanho
--   FROM pg_stat_user_indexes
--   WHERE idx_scan = 0 AND indexname LIKE '%trgm%'
--   ORDER BY pg_relation_size(indexname::regclass) DESC;
--
-- Rollback: recriar o índice (sem CONCURRENTLY — tabelas pequenas).
-- ============================================================

-- Verificação prévia (executar antes de dropar):
SELECT
  s.indexrelname AS index_name,
  s.relname AS table_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS size
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
JOIN pg_am am ON am.oid = (
  SELECT relam FROM pg_class WHERE oid = i.indexrelid
)
WHERE s.idx_scan < 10
  AND am.amname IN ('gin', 'gist')
ORDER BY pg_relation_size(i.indexrelid) DESC
LIMIT 20;

-- TEMPLATE para remoção (verificar um por um):
-- BEGIN;
-- DROP INDEX IF EXISTS public.<index_name>;
-- COMMIT;

-- Rollback template:
-- BEGIN;
-- CREATE INDEX <index_name> ON public.<table_name>
--   USING GIN (<coluna> gin_trgm_ops);
-- COMMIT;
