-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928490000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

REVOKE DELETE ON public.team_message_receipts FROM authenticated;

CREATE OR REPLACE FUNCTION public.team_message_receipts_update_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF OLD.status = 'read' AND NEW.status <> 'read' THEN RAISE EXCEPTION 'Cannot downgrade receipt status from read'; END IF; IF NEW.status = 'read' THEN NEW.read_at := COALESCE(NEW.read_at, now()); END IF; RETURN NEW; END; $f$;

REVOKE EXECUTE ON FUNCTION public.team_message_receipts_update_guard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_message_receipts_update_guard() TO authenticated;

DROP TRIGGER IF EXISTS team_message_receipts_update_guard_trig ON public.team_message_receipts;

CREATE TRIGGER team_message_receipts_update_guard_trig BEFORE UPDATE ON public.team_message_receipts FOR EACH ROW EXECUTE FUNCTION public.team_message_receipts_update_guard();

DROP POLICY IF EXISTS "Members can update own receipts" ON public.team_message_receipts;

CREATE POLICY team_message_receipts_update_own ON public.team_message_receipts FOR UPDATE TO authenticated USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id() AND status = 'read');
