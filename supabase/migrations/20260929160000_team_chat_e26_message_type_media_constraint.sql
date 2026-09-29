-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929160000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_type_media_check CHECK (message_type IN ('text','image','audio','video','file','sticker','system') OR media_url IS NULL);

COMMENT ON COLUMN public.team_messages.media_url IS 'URL temporária; prefer media_bucket+media_path para acesso persistente';
