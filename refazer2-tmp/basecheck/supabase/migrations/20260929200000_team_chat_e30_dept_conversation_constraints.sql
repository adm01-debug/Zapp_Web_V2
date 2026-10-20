-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929200000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_conversations_dept_unique ON public.team_conversations(department_id) WHERE type = 'department' AND department_id IS NOT NULL;

ALTER TABLE public.team_conversations DROP CONSTRAINT IF EXISTS team_conversations_department_id_fkey;

ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
