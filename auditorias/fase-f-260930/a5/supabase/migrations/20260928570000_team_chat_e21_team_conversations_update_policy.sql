-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928570000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

REVOKE UPDATE (type, created_by, department_id) ON public.team_conversations FROM authenticated;

DROP POLICY IF EXISTS "Creator can update conversation" ON public.team_conversations;

CREATE POLICY team_conversations_update_own ON public.team_conversations FOR UPDATE TO authenticated USING (created_by = public.current_profile_id()) WITH CHECK (created_by = public.current_profile_id());
