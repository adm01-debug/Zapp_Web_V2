-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929190000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_dept_required CHECK (type <> 'department' OR department_id IS NOT NULL);

ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_group_name_required CHECK (type <> 'group' OR name IS NOT NULL);

CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_my_profile_id uuid; v_conv_id uuid; BEGIN v_my_profile_id := public.current_profile_id(); IF v_my_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; IF v_my_profile_id = other_profile_id THEN RAISE EXCEPTION 'cannot_create_direct_with_self'; END IF; SELECT c.id INTO v_conv_id FROM public.team_conversations c JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id WHERE c.type = 'direct' LIMIT 1; IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF; INSERT INTO public.team_conversations(type, created_by) VALUES ('direct', v_my_profile_id) RETURNING id INTO v_conv_id; INSERT INTO public.team_conversation_members(conversation_id, profile_id) VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id); RETURN v_conv_id; END; $f$;

REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated;
