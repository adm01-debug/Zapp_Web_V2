-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929400000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); v_conv RECORD; v_result jsonb; BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_profile_id AND p.role IN ('admin', 'supervisor')) THEN RAISE EXCEPTION 'not_authorized'; END IF; SELECT id, type, department_id, metadata INTO v_conv FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE; IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF; IF v_conv.type <> 'department' THEN RAISE EXCEPTION 'not_a_department_conversation'; END IF; UPDATE public.team_conversations SET department_id = p_to_department_id, metadata = COALESCE(v_conv.metadata, '{}'::jsonb) || jsonb_build_object('transferred_at', now()::text, 'transferred_by', v_profile_id, 'original_department_id', v_conv.department_id) WHERE id = p_conversation_id RETURNING to_json(team_conversations.*) INTO v_result; RETURN jsonb_build_object('ok', true, 'conversation_id', p_conversation_id, 'from_department_id', v_conv.department_id, 'to_department_id', p_to_department_id); END; $f$;

REVOKE EXECUTE ON FUNCTION public.transfer_team_conversation_department(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_team_conversation_department(uuid, uuid) TO authenticated;
