-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929240000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DO $$ BEGIN BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages; EXCEPTION WHEN duplicate_object THEN NULL; END; BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversations; EXCEPTION WHEN duplicate_object THEN NULL; END; BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversation_members; EXCEPTION WHEN duplicate_object THEN NULL; END; BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_message_receipts; EXCEPTION WHEN duplicate_object THEN NULL; END; END; $$;
