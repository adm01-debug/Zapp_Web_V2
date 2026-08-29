-- Reconciliacao do ledger de migrations — correcoes diretas no schema_migrations
-- Executadas em 2026-08-29 via MCP apos auditoria de 5 agentes

-- 1. 20260827130000: statements corrigidos para referenciar o filename atual
--    (Fonte de verdade: fix_gmail_crypto_search_path → fix_gmail_crypto_search_path_and_missing_key)
UPDATE supabase_migrations.schema_migrations
  SET statements = ARRAY[
    '-- CREATE OR REPLACE public.encrypt_gmail_token(text): search_path public -> public, extensions',
    '-- CREATE OR REPLACE public.decrypt_gmail_token(bytea): idem + RAISE quando app.encryption_key ausente',
    '-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path_and_missing_key.sql'
  ]
  WHERE version = '20260827130000'
    AND statements[3] = '-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path.sql';

-- 2. 20260829020000: name corrigido para bater com ledger_name no evidence.json
--    (mcp_exec_functions_harden → fix_reassign_absent_agents_last_seen_at)
UPDATE supabase_migrations.schema_migrations
  SET name = 'fix_reassign_absent_agents_last_seen_at'
  WHERE version = '20260829020000'
    AND name = 'mcp_exec_functions_harden';
