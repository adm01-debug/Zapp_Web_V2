-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929180000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.team_messages_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF OLD.sender_id <> public.current_profile_id() THEN RAISE EXCEPTION 'only sender can edit message'; END IF; IF OLD.created_at < now() - interval '48 hours' THEN RAISE EXCEPTION 'edit window expired (48h)'; END IF; NEW.is_edited := true; NEW.updated_at := now(); RETURN NEW; END; $f$;

REVOKE EXECUTE ON FUNCTION public.team_messages_edit_guard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_messages_edit_guard() TO authenticated;

DROP TRIGGER IF EXISTS team_messages_edit_guard_trig ON public.team_messages;

CREATE TRIGGER team_messages_edit_guard_trig BEFORE UPDATE OF content ON public.team_messages FOR EACH ROW EXECUTE FUNCTION public.team_messages_edit_guard();
