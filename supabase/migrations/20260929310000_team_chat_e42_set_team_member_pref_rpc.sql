-- E42: set_team_member_pref() — atualiza preferências de membro (mute)
CREATE OR REPLACE FUNCTION public.set_team_member_pref(p_conversation_id uuid, p_is_muted boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid := public.current_profile_id(); BEGIN IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF; UPDATE public.team_conversation_members SET is_muted = COALESCE(p_is_muted, is_muted) WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id; IF NOT FOUND THEN RAISE EXCEPTION 'not_member'; END IF; END; $f$;

REVOKE EXECUTE ON FUNCTION public.set_team_member_pref(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_member_pref(uuid, boolean) TO authenticated;
