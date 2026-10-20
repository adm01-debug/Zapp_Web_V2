-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928500000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.department_invitations ADD COLUMN IF NOT EXISTS used_at timestamptz, ADD COLUMN IF NOT EXISTS used_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS max_uses integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.department_invitations ADD CONSTRAINT department_invitations_code_format CHECK (length(code) BETWEEN 6 AND 64);

ALTER TABLE public.department_invitations ADD CONSTRAINT department_invitations_expires_after_created CHECK (expires_at IS NULL OR expires_at > created_at);

ALTER TABLE public.department_invitations ADD CONSTRAINT department_invitations_max_uses_positive CHECK (max_uses >= 1);

ALTER TABLE public.department_invitations ADD CONSTRAINT department_invitations_use_count_nonneg CHECK (use_count >= 0);

CREATE INDEX IF NOT EXISTS idx_department_invitations_code ON public.department_invitations(code) WHERE status = 'pending';
