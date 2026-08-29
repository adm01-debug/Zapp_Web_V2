-- Reconciliacao do ledger de migrations — correcoes diretas no schema_migrations
-- Executadas em 2026-08-29 via MCP apos auditoria de 5 agentes

-- 1. 20260827130000: statements corrigidos para referenciar o filename atual
--    (Fonte de verdade: fix_gmail_crypto_search_path → fix_gmail_crypto_search_path_and_missing_key)
UPDATE supabase_migrations.schema_migrations
  SET statements[3] = '-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path_and_missing_key.sql'
  WHERE version = '20260827130000'
    AND statements[3] = '-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path.sql';

-- 2. 20260829020000: name corrigido para bater com ledger_name no evidence.json
--    (mcp_exec_functions_harden → fix_reassign_absent_agents_last_seen_at)
-- O predicado de conteudo e obrigatorio: em replay limpo, essa mesma versao
-- pertence legitimamente ao hardening de mcp_exec e nao pode ser renomeada.
UPDATE supabase_migrations.schema_migrations
  SET name = 'fix_reassign_absent_agents_last_seen_at'
  WHERE version = '20260829020000'
    AND name = 'mcp_exec_functions_harden'
    AND cardinality(statements) = 1
    AND statements[1] ~* '^CREATE[[:space:]]+OR[[:space:]]+REPLACE[[:space:]]+FUNCTION[[:space:]]+public\.reassign_absent_agents[[:space:]]*\('
    AND statements[1] !~* 'public\.mcp_exec(_many)?[[:space:]]*\('
    AND encode(
      sha256(
        convert_to('zapp-migration-ledger-statements-v1', 'UTF8')
        || decode('00', 'hex')
        || convert_to(array_to_json(statements)::text, 'UTF8')
      ),
      'hex'
    ) = '153653d2bc3d08f05e04145162e92bd8afb9d181deb033a8fb931f942ccb726a';
