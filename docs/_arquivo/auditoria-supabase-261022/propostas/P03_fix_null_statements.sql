-- P03: Corrigir 65 migrations com statements NULL no ledger
-- Severidade: MÉDIA
-- Status: NÃO APLICADA
-- Rollback: ver seção ROLLBACK abaixo
--
-- O problema: 65 migrations têm statements IS NULL no ledger.
-- Isso impede replay local e invalida hash no db-migrate.yml.
--
-- Procedimento (da regra da seção 1 do CLAUDE.md):
-- 1. Para cada migration com NULL: ler o arquivo .sql no repo
-- 2. Confirmar que o DDL já está aplicado em produção
-- 3. Atualizar o ledger com o conteúdo real

-- ============================================================
-- DIAGNÓSTICO (somente leitura):
-- ============================================================

-- Listar todas com NULL:
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE statements IS NULL
ORDER BY version;
-- Resultado: 65 migrations

-- Verificar uma específica (exemplo: dashboard_kpi_periodo_aditivo):
-- SELECT statements FROM supabase_migrations.schema_migrations
-- WHERE version = '20261026210000';
-- Resultado: NULL

-- ============================================================
-- APLICAR (template — executar por migration individualmente):
-- ============================================================

/*
-- Para cada migration com NULL:
-- 1. Ler o arquivo no repo: supabase/migrations/<version>_<name>.sql
-- 2. Confirmar que o objeto existe em produção:
--    SELECT pg_get_functiondef('<nome_funcao>'::regproc);
--    ou SELECT count(*) FROM information_schema.tables WHERE table_name='<nome_tabela>';
-- 3. Atualizar o ledger:

UPDATE supabase_migrations.schema_migrations
SET statements = ARRAY['<conteudo_sql_do_arquivo>']
WHERE version = '<version>'
  AND statements IS NULL
RETURNING version, name, array_length(statements, 1);
-- Confirmar RETURNING não vazio antes de considerar aplicado
*/

-- ============================================================
-- ROLLBACK:
-- ============================================================

/*
-- Se a atualização foi errada, reverter para NULL:
UPDATE supabase_migrations.schema_migrations
SET statements = NULL
WHERE version = '<version>';
-- AVISO: isso recria o problema original. Só usar como rollback temporário.
*/