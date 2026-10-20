-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928480000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

DROP POLICY IF EXISTS "team_messages_update" ON public.team_messages;

DROP POLICY IF EXISTS "Users can update own team messages" ON public.team_messages;

DROP POLICY IF EXISTS "team_messages_update_own" ON public.team_messages;

CREATE POLICY "team_messages_update_own" ON public.team_messages FOR UPDATE TO authenticated USING (sender_id = current_profile_id()) WITH CHECK (sender_id = current_profile_id());
