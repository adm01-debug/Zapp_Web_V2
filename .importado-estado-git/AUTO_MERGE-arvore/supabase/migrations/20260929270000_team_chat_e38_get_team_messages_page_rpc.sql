-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260929270000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs

CREATE OR REPLACE FUNCTION public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL, p_limit integer DEFAULT 50) RETURNS TABLE (id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamptz, updated_at timestamptz, sender_name text, sender_avatar text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); v_before_at timestamptz; BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; IF NOT EXISTS (SELECT 1 FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id) THEN RAISE EXCEPTION 'not_member'; END IF; IF p_before_id IS NOT NULL THEN SELECT created_at INTO v_before_at FROM public.team_messages WHERE id = p_before_id; END IF; RETURN QUERY SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type, m.reply_to_id, m.media_url, m.media_type, m.media_bucket, m.media_path, m.is_edited, m.created_at, m.updated_at, p.name, p.avatar_url FROM public.team_messages m LEFT JOIN public.profiles p ON p.id = m.sender_id WHERE m.conversation_id = p_conversation_id AND (v_before_at IS NULL OR m.created_at < v_before_at) ORDER BY m.created_at DESC LIMIT LEAST(p_limit, 200); END; $f$;

REVOKE EXECUTE ON FUNCTION public.get_team_messages_page(uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_team_messages_page(uuid, uuid, integer) TO authenticated;
