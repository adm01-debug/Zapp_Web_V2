-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929330000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.remove_team_member(p_conversation_id uuid, p_profile_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_caller_id uuid := public.current_profile_id(); v_creator uuid; BEGIN IF v_caller_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; SELECT created_by INTO v_creator FROM public.team_conversations WHERE id = p_conversation_id; IF v_caller_id <> v_creator THEN RAISE EXCEPTION 'only_creator_can_remove_members'; END IF; IF p_profile_id = v_creator THEN RAISE EXCEPTION 'creator_cannot_remove_self_use_leave'; END IF; DELETE FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id; IF NOT FOUND THEN RAISE EXCEPTION 'target_not_member'; END IF; END; $f$;

REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) TO authenticated;
