-- 20260829060000_reconcile_ledger_drift
-- Correcao de metadados do ledger aplicada diretamente ao banco em 29/08/2026.
-- Registrado retroativamente no repo para paridade files==banco.
UPDATE supabase_migrations.schema_migrations SET statements = statements WHERE version = '20260827130000';
UPDATE supabase_migrations.schema_migrations SET name = 'fix_reassign_absent_agents_last_seen_at' WHERE version = '20260829020000';
