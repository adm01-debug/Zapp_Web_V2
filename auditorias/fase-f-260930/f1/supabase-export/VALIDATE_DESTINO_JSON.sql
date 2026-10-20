-- ============================================================
-- VALIDATE_DESTINO_JSON.sql
-- Gera um JSON com as métricas de validação do banco destino.
-- ============================================================
\timing off
\pset tuples_only on
\pset format unaligned

-- Baseline (deve ser mantida em sincronia com VALIDATE_DESTINO.sql)
\set EXP_TABLES        120
\set EXP_TABLES_RLS    120
\set EXP_PK            120
\set EXP_FK            169
\set EXP_UQ            46
\set EXP_CK            22
\set EXP_IDX           293
\set EXP_POL           362
\set EXP_FUN           59
\set EXP_TRG           69
\set EXP_VIEW          7
\set EXP_ENUM          4

WITH actual AS (
  SELECT
    (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r')                                                    AS tables,
    (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true)                          AS tables_rls,
    (SELECT COUNT(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='p')    AS pk,
    (SELECT COUNT(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f')    AS fk,
    (SELECT COUNT(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='u')    AS uq,
    (SELECT COUNT(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c')    AS ck,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public')                                       AS idx,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public')                                      AS pol,
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS fun,
    (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal)                                              AS trg,
    (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='v')                                                    AS vw,
    (SELECT COUNT(DISTINCT t.typname) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
        JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')                          AS enum
),
metrics AS (
  SELECT 'Tables' AS key, tables AS actual, :EXP_TABLES AS expected FROM actual UNION ALL
  SELECT 'Tables RLS', tables_rls, :EXP_TABLES_RLS FROM actual UNION ALL
  SELECT 'Primary Keys', pk, :EXP_PK FROM actual UNION ALL
  SELECT 'Foreign Keys', fk, :EXP_FK FROM actual UNION ALL
  SELECT 'Unique Constraints', uq, :EXP_UQ FROM actual UNION ALL
  SELECT 'Check Constraints', ck, :EXP_CK FROM actual UNION ALL
  SELECT 'Indexes', idx, :EXP_IDX FROM actual UNION ALL
  SELECT 'RLS Policies', pol, :EXP_POL FROM actual UNION ALL
  SELECT 'Functions', fun, :EXP_FUN FROM actual UNION ALL
  SELECT 'Triggers', trg, :EXP_TRG FROM actual UNION ALL
  SELECT 'Views', vw, :EXP_VIEW FROM actual UNION ALL
  SELECT 'Enums', enum, :EXP_ENUM FROM actual
)
SELECT json_build_object(
  'timestamp', now(),
  'database', current_database(),
  'metrics', (
    SELECT json_agg(
      json_build_object(
        'name', key,
        'actual', actual,
        'expected', expected,
        'status', CASE 
          WHEN actual = expected THEN 'OK'
          WHEN actual < expected THEN 'FAIL'
          ELSE 'EXTRA'
        END
      )
    ) FROM metrics
  )
);