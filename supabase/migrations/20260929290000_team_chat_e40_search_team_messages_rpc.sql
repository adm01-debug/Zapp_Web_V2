-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929290000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.search_team_messages(p_conversation_id uuid, p_query text, p_limit integer DEFAULT 20) RETURNS TABLE (id uuid, sender_id uuid, content text, created_at timestamptz, sender_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; IF NOT EXISTS (SELECT 1 FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id) THEN RAISE EXCEPTION 'not_member'; END IF; RETURN QUERY SELECT m.id, m.sender_id, m.content, m.created_at, p.name FROM public.team_messages m LEFT JOIN public.profiles p ON p.id = m.sender_id WHERE m.conversation_id = p_conversation_id AND m.content ILIKE '%' || p_query || '%' ORDER BY m.created_at DESC LIMIT LEAST(p_limit, 100); END; $f$;

REVOKE EXECUTE ON FUNCTION public.search_team_messages(uuid, text, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_team_messages(uuid, text, integer) TO authenticated;
