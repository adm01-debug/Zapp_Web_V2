-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928600000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_messages ALTER COLUMN is_edited SET NOT NULL;

ALTER TABLE public.team_messages ALTER COLUMN is_edited SET DEFAULT false;

ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_content_not_empty CHECK (trim(content) <> '' OR media_url IS NOT NULL);

ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_media_consistency CHECK ((media_url IS NULL) = (media_type IS NULL));

CREATE INDEX IF NOT EXISTS idx_team_messages_reply_to ON public.team_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_messages_conv_created ON public.team_messages(conversation_id, created_at DESC);
