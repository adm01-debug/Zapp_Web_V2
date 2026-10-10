-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929210000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_conversation_members ADD CONSTRAINT team_conv_members_last_read_at_check CHECK (last_read_at IS NULL OR last_read_at <= now() + interval '5 seconds');

CREATE INDEX IF NOT EXISTS idx_team_conv_members_profile_id ON public.team_conversation_members(profile_id);

CREATE INDEX IF NOT EXISTS idx_team_conv_members_conv_muted ON public.team_conversation_members(conversation_id, is_muted) WHERE is_muted = true;
