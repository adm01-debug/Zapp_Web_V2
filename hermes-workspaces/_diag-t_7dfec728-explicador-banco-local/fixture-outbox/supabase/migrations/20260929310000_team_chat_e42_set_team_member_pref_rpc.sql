-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929310000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.set_team_member_pref(p_conversation_id uuid, p_is_muted boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; UPDATE public.team_conversation_members SET is_muted = COALESCE(p_is_muted, is_muted) WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id; IF NOT FOUND THEN RAISE EXCEPTION 'not_member'; END IF; END; $f$;

REVOKE EXECUTE ON FUNCTION public.set_team_member_pref(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_team_member_pref(uuid, boolean) TO authenticated;
