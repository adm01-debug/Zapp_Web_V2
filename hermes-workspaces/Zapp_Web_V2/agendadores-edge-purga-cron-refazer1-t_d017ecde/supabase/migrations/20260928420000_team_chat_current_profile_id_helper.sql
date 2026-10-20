-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928420000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon;

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
