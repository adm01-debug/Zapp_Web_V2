-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928440000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_message_receipts ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.team_conversations(id) ON DELETE CASCADE;

UPDATE public.team_message_receipts r SET conversation_id = m.conversation_id FROM public.team_messages m WHERE m.id = r.message_id AND r.conversation_id IS NULL;

CREATE INDEX idx_team_message_receipts_conversation_id ON public.team_message_receipts (conversation_id) WHERE conversation_id IS NOT NULL;
