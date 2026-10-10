-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929230000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_message_receipts ADD CONSTRAINT team_receipts_read_at_required CHECK (status <> 'read' OR read_at IS NOT NULL);

ALTER TABLE public.team_message_receipts ADD CONSTRAINT team_receipts_delivered_at_required CHECK (status NOT IN ('delivered','read') OR delivered_at IS NOT NULL);

CREATE OR REPLACE FUNCTION public.team_receipts_no_own_sender() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF EXISTS (SELECT 1 FROM public.team_messages WHERE id = NEW.message_id AND sender_id = NEW.profile_id) THEN RAISE EXCEPTION 'sender cannot create receipt for own message'; END IF; RETURN NEW; END; $f$;

REVOKE EXECUTE ON FUNCTION public.team_receipts_no_own_sender() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_receipts_no_own_sender() TO authenticated;

DROP TRIGGER IF EXISTS team_receipts_no_own_sender_trig ON public.team_message_receipts;

CREATE TRIGGER team_receipts_no_own_sender_trig BEFORE INSERT ON public.team_message_receipts FOR EACH ROW EXECUTE FUNCTION public.team_receipts_no_own_sender();
