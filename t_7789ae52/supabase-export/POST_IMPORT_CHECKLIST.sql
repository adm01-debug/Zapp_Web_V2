-- ============================================================
-- POST-IMPORT CHECKLIST — Validação rápida do schema migrado
-- ============================================================
-- Como usar:
--   1) No banco de ORIGEM:   psql "$ORIGEM_URL"  -f POST_IMPORT_CHECKLIST.sql > origem.txt
--   2) No banco de DESTINO:  psql "$DESTINO_URL" -f POST_IMPORT_CHECKLIST.sql > destino.txt
--   3) Comparar:             diff origem.txt destino.txt
--
-- Cada seção imprime um cabeçalho \echo e um SELECT determinístico
-- (ORDER BY estável) pra que o diff seja linha-a-linha.
-- Valores esperados após restore COMPLETO (referência atual da origem):
--   tabelas public ............ 120
--   tabelas com RLS ........... 119
--   policies public ........... 362
--   policies storage.objects .. 29
--   indexes idx_* ............. 127
--   functions public .......... 59  (54 SECURITY DEFINER, 5 INVOKER)
--   enums public .............. 4
--   buckets storage ........... 7
-- ============================================================

\pset pager off
\pset format aligned
\pset border 1

-- ------------------------------------------------------------
\echo '=== [1] CONTAGENS GLOBAIS ==='
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_tables       WHERE schemaname='public')                                AS tables_public,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)                             AS tables_rls_enabled,
  (SELECT count(*) FROM pg_policies     WHERE schemaname='public')                                AS policies_public,
  (SELECT count(*) FROM pg_policies     WHERE schemaname='storage' AND tablename='objects')       AS policies_storage,
  (SELECT count(*) FROM pg_indexes      WHERE schemaname='public' AND indexname LIKE 'idx_%')     AS indexes_idx,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prokind IN ('f','p'))                                         AS functions_public,
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname='public' AND t.typtype='e')                                                  AS enums_public,
  (SELECT count(*) FROM storage.buckets)                                                          AS storage_buckets,
  (SELECT count(*) FROM information_schema.views WHERE table_schema='public')                     AS views_public,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)                                        AS triggers_user;

-- ------------------------------------------------------------
\echo ''
\echo '=== [2] TABELAS public (ordem alfabetica) ==='
-- ------------------------------------------------------------
SELECT tablename, rowsecurity AS rls
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename;

-- ------------------------------------------------------------
\echo ''
\echo '=== [3] TABELAS SEM RLS (devem ser ZERO) ==='
-- ------------------------------------------------------------
SELECT n.nspname AS schema, c.relname AS table
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
ORDER BY 1,2;

-- ------------------------------------------------------------
\echo ''
\echo '=== [4] PRIMARY KEYS por tabela ==='
-- ------------------------------------------------------------
SELECT
  tc.table_name,
  string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS pk_columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema
WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- ------------------------------------------------------------
\echo ''
\echo '=== [5] FOREIGN KEYS (table -> ref_table.col) ==='
-- ------------------------------------------------------------
SELECT
  conrelid::regclass::text  AS from_table,
  conname                   AS fk_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype='f' AND connamespace='public'::regnamespace
ORDER BY 1,2;

-- ------------------------------------------------------------
\echo ''
\echo '=== [6] UNIQUE / CHECK constraints ==='
-- ------------------------------------------------------------
SELECT
  conrelid::regclass::text  AS table,
  conname                   AS name,
  contype                   AS type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype IN ('u','c') AND connamespace='public'::regnamespace
ORDER BY 1,3,2;

-- ------------------------------------------------------------
\echo ''
\echo '=== [7] INDICES public (todos) ==='
-- ------------------------------------------------------------
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
ORDER BY tablename, indexname;

-- ------------------------------------------------------------
\echo ''
\echo '=== [8] HASHES de POLICIES (md5 da definicao normalizada) ==='
-- ------------------------------------------------------------
-- Detecta divergencia em USING / WITH CHECK / roles / cmd entre origem e destino.
SELECT
  schemaname, tablename, policyname, cmd, permissive,
  COALESCE(array_to_string(roles,','),'public') AS roles,
  md5(
    coalesce(qual,'') || '|' ||
    coalesce(with_check,'') || '|' ||
    coalesce(array_to_string(roles,','),'') || '|' ||
    cmd || '|' || permissive
  ) AS policy_hash
FROM pg_policies
WHERE schemaname IN ('public','storage')
ORDER BY schemaname, tablename, policyname;

-- ------------------------------------------------------------
\echo ''
\echo '=== [9] FUNCTIONS public (com flags de seguranca) ==='
-- ------------------------------------------------------------
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS sec,
  CASE WHEN array_to_string(p.proconfig,',') ILIKE '%search_path%' THEN 'YES' ELSE 'NO' END AS search_path_set,
  l.lanname AS lang,
  md5(pg_get_functiondef(p.oid)) AS body_hash
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l  ON l.oid=p.prolang
WHERE n.nspname='public' AND p.prokind IN ('f','p')
ORDER BY p.proname, args;

-- ------------------------------------------------------------
\echo ''
\echo '=== [10] FUNCTIONS SECURITY DEFINER SEM search_path (ALERTA) ==='
-- ------------------------------------------------------------
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND (p.proconfig IS NULL OR NOT (array_to_string(p.proconfig,',') ILIKE '%search_path%'))
ORDER BY 1,2;

-- ------------------------------------------------------------
\echo ''
\echo '=== [11] TRIGGERS de usuario ==='
-- ------------------------------------------------------------
SELECT
  c.relname AS table,
  t.tgname  AS trigger,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class     c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage')
ORDER BY n.nspname, c.relname, t.tgname;

-- ------------------------------------------------------------
\echo ''
\echo '=== [12] ENUMS e seus valores ==='
-- ------------------------------------------------------------
SELECT t.typname AS enum_name,
       string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid=t.oid
JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public'
GROUP BY t.typname
ORDER BY t.typname;

-- ------------------------------------------------------------
\echo ''
\echo '=== [13] STORAGE buckets ==='
-- ------------------------------------------------------------
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- ------------------------------------------------------------
\echo ''
\echo '=== [14] VIEWS public ==='
-- ------------------------------------------------------------
SELECT table_name, md5(view_definition) AS view_hash
FROM information_schema.views
WHERE table_schema='public'
ORDER BY table_name;

-- ------------------------------------------------------------
\echo ''
\echo '=== [15] EXTENSIONS instaladas ==='
-- ------------------------------------------------------------
SELECT extname, extversion
FROM pg_extension
ORDER BY extname;

-- ------------------------------------------------------------
\echo ''
\echo '=== [16] PUBLICATIONS / REALTIME ==='
-- ------------------------------------------------------------
SELECT p.pubname, c.relname AS table
FROM pg_publication p
LEFT JOIN pg_publication_rel pr ON pr.prpubid=p.oid
LEFT JOIN pg_class c ON c.oid=pr.prrelid
ORDER BY p.pubname, c.relname;

\echo ''
\echo '============================================================'
\echo 'FIM CHECKLIST. Rode em origem + destino e use:'
\echo '   diff origem.txt destino.txt | less'
\echo 'Qualquer linha divergente em [8] policy_hash ou [9] body_hash'
\echo 'indica policy/funcao com definicao diferente entre os bancos.'
\echo '============================================================'
