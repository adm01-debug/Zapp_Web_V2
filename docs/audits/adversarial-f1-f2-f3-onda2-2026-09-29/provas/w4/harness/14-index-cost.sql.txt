-- =============================================================================
-- W4 -- Custo e uso dos indices: tamanho, tempo de criacao e contagem de scans.
--   psql -v vol=<n> -f 14-index-cost.sql
-- =============================================================================
\pset border 2
\pset format aligned

SELECT :vol AS volume,
       c.relname AS indice,
       pg_size_pretty(pg_relation_size(c.oid)) AS tamanho,
       pg_size_pretty(pg_relation_size(i.indexrelid)) AS tamanho_idx,
       coalesce(s.idx_scan, 0) AS scans,
       am.amname AS metodo
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_am am ON am.oid = c.relam
LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
WHERE t.relname = 'contacts'
ORDER BY pg_relation_size(i.indexrelid) DESC;

SELECT :vol AS volume,
       count(*) AS indices,
       pg_size_pretty(sum(pg_relation_size(i.indexrelid))) AS total_indices,
       pg_size_pretty(pg_relation_size('public.contacts')) AS tabela
FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid
WHERE t.relname = 'contacts';
