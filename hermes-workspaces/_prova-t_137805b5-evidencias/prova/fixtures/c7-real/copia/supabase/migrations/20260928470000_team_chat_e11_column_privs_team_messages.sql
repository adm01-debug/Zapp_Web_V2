-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928470000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

REVOKE UPDATE ON TABLE public.team_messages FROM authenticated;

GRANT UPDATE (content, is_edited, updated_at) ON TABLE public.team_messages TO authenticated;
