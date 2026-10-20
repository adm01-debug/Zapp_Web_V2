-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929300000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.toggle_team_reaction(p_message_id uuid, p_emoji text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); v_exists boolean; BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; SELECT EXISTS(SELECT 1 FROM public.team_message_reactions WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji) INTO v_exists; IF v_exists THEN DELETE FROM public.team_message_reactions WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji; RETURN jsonb_build_object('action', 'removed', 'emoji', p_emoji); ELSE INSERT INTO public.team_message_reactions(message_id, profile_id, emoji) VALUES (p_message_id, v_profile_id, p_emoji) ON CONFLICT DO NOTHING; RETURN jsonb_build_object('action', 'added', 'emoji', p_emoji); END IF; END; $f$;

REVOKE EXECUTE ON FUNCTION public.toggle_team_reaction(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.toggle_team_reaction(uuid, text) TO authenticated;
