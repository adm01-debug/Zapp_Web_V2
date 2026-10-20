-- ============================================================
-- VALIDATE_DESTINO.sql
-- Valida o banco DESTINO após aplicar BLOCOS 01..15
-- Schema: public
--
-- Uso:
--   psql "$DESTINO_URL" -v ON_ERROR_STOP=1 -f supabase-export/VALIDATE_DESTINO.sql
--
-- Saída: tabela com [verificacao | atual | esperado | status]
--   ✅ OK       = atual >= esperado
--   ❌ FAIL    = atual <  esperado (faltam objetos)
--   ⚠️  EXTRA  = atual >  esperado (objetos a mais — investigar)
-- ============================================================
\timing off
\pset border 2
\pset linestyle unicode
\pset format aligned

-- Baseline esperada (origem em 12/05/2026)
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
expected(verificacao, esperado) AS (
  VALUES
    ('Tables (public)',          :EXP_TABLES),
    ('Tables com RLS habilitado',:EXP_TABLES_RLS),
    ('Primary Keys',             :EXP_PK),
    ('Foreign Keys',             :EXP_FK),
    ('Unique constraints',       :EXP_UQ),
    ('Check constraints',        :EXP_CK),
    ('Indexes',                  :EXP_IDX),
    ('RLS Policies',             :EXP_POL),
    ('Functions',                :EXP_FUN),
    ('Triggers',                 :EXP_TRG),
    ('Views',                    :EXP_VIEW),
    ('Enum types',               :EXP_ENUM)
),
pairs AS (
  SELECT 'Tables (public)'           AS verificacao, a.tables      AS atual FROM actual a UNION ALL
  SELECT 'Tables com RLS habilitado',a.tables_rls               FROM actual a UNION ALL
  SELECT 'Primary Keys',             a.pk                       FROM actual a UNION ALL
  SELECT 'Foreign Keys',             a.fk                       FROM actual a UNION ALL
  SELECT 'Unique constraints',       a.uq                       FROM actual a UNION ALL
  SELECT 'Check constraints',        a.ck                       FROM actual a UNION ALL
  SELECT 'Indexes',                  a.idx                      FROM actual a UNION ALL
  SELECT 'RLS Policies',             a.pol                      FROM actual a UNION ALL
  SELECT 'Functions',                a.fun                      FROM actual a UNION ALL
  SELECT 'Triggers',                 a.trg                      FROM actual a UNION ALL
  SELECT 'Views',                    a.vw                       FROM actual a UNION ALL
  SELECT 'Enum types',               a.enum                     FROM actual a
)
SELECT
  p.verificacao,
  p.atual,
  e.esperado,
  CASE
    WHEN p.atual = e.esperado THEN '✅ OK'
    WHEN p.atual <  e.esperado THEN '❌ FAIL ('||(e.esperado - p.atual)||' faltando)'
    ELSE '⚠️  EXTRA (+'||(p.atual - e.esperado)||')'
  END AS status
FROM pairs p
JOIN expected e USING (verificacao)
ORDER BY p.verificacao;

-- ============================================================
-- DETALHAMENTO 1: Tabelas SEM Primary Key (deve estar VAZIO)
-- ============================================================
\echo
\echo '=== Tabelas SEM Primary Key (deve estar VAZIO) ==='
SELECT n.nspname || '.' || c.relname AS tabela_sem_pk
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_constraint con ON con.conrelid = c.oid AND con.contype='p'
WHERE n.nspname='public' AND c.relkind='r' AND con.oid IS NULL
ORDER BY 1;

-- ============================================================
-- DETALHAMENTO 2: Tabelas SEM RLS habilitado (deve estar VAZIO)
-- ============================================================
\echo
\echo '=== Tabelas SEM RLS habilitado (deve estar VAZIO) ==='
SELECT n.nspname || '.' || c.relname AS tabela_sem_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
ORDER BY 1;

-- ============================================================
-- DETALHAMENTO 3: FKs órfãs / com referência inválida
-- ============================================================
\echo
\echo '=== Foreign Keys com tabela alvo inexistente (deve estar VAZIO) ==='
SELECT con.conname, c.relname AS tabela
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_class fc ON fc.oid = con.confrelid
WHERE n.nspname='public' AND con.contype='f' AND fc.oid IS NULL;

-- ============================================================
-- DETALHAMENTO 4: Tabelas com RLS habilitado mas SEM nenhuma POLICY
-- (perigoso: nega TUDO para usuários autenticados)
-- ============================================================
\echo
\echo '=== Tabelas com RLS ON mas SEM policies (REVISAR) ==='
SELECT c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname
  )
ORDER BY 1;

-- ============================================================
-- DETALHAMENTO 5: Resumo de policies por tabela (top 10)
-- ============================================================
\echo
\echo '=== Top 10 tabelas por número de policies ==='
SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename
ORDER BY 2 DESC
LIMIT 10;

\echo
\echo '============================================================'
\echo 'Validação concluída. Revise linhas com ❌ FAIL ou ⚠️  EXTRA.'
\echo '============================================================'