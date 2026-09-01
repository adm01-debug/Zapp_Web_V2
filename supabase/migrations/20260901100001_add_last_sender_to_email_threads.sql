-- Migration aplicada diretamente em producao (DDL fora do Git).
-- Statements abaixo correspondem ao ledger exato em schema_migrations.statements.
-- A funcao sync_thread_last_sender tem corpo real em producao; o ledger registrou
-- apenas o placeholder $$ ... $$ porque a DDL foi aplicada manualmente.
-- NAO re-aplicar: registro ja existe em supabase_migrations.schema_migrations.
ALTER TABLE email_threads ADD COLUMN last_from_name TEXT, ADD COLUMN last_from_address TEXT;
CREATE OR REPLACE FUNCTION sync_thread_last_sender() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ ... $$;
CREATE TRIGGER trg_sync_thread_last_sender AFTER INSERT OR UPDATE ON email_messages FOR EACH ROW EXECUTE FUNCTION sync_thread_last_sender();
