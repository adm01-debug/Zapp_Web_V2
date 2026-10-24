-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929320000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.leave_team_group(p_conversation_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); v_type text; BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; SELECT type INTO v_type FROM public.team_conversations WHERE id = p_conversation_id; IF v_type = 'direct' THEN RAISE EXCEPTION 'cannot_leave_direct_conversation'; END IF; IF v_type = 'department' THEN RAISE EXCEPTION 'cannot_leave_department_conversation_directly'; END IF; DELETE FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id; IF NOT FOUND THEN RAISE EXCEPTION 'not_member'; END IF; END; $f$;

REVOKE EXECUTE ON FUNCTION public.leave_team_group(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.leave_team_group(uuid) TO authenticated;
