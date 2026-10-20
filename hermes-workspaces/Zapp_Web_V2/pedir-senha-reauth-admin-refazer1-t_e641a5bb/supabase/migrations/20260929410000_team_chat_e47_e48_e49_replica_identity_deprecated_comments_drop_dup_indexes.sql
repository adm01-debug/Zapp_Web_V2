-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929410000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_messages REPLICA IDENTITY DEFAULT;

COMMENT ON FUNCTION public.get_team_conversation_previews() IS 'deprecated: usar get_team_inbox()';

COMMENT ON FUNCTION public.get_team_unread_counts() IS 'deprecated: usar get_team_inbox()';

DROP INDEX IF EXISTS public.idx_team_messages_conversation;

DROP INDEX IF EXISTS public.idx_team_messages_reply_to_id;

DROP INDEX IF EXISTS public.idx_team_members_profile;
