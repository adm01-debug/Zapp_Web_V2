CREATE OR REPLACE FUNCTION public.revoke_auth_sessions(p_scope text, p_actor_user_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_target_session_id uuid DEFAULT NULL::uuid, p_preserve_session_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_count integer := 0;
BEGIN
    IF p_scope NOT IN ('global', 'local', 'others') THEN
        RAISE EXCEPTION 'scope invalido';
    END IF;

    IF p_scope = 'global' THEN
        IF p_target_user_id IS NULL THEN
            RAISE EXCEPTION 'scope global exige target_user_id';
        END IF;
        DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        -- refresh tokens órfãos (sem vínculo de sessão) do usuário
        UPDATE auth.refresh_tokens
           SET revoked = true, updated_at = now()
         WHERE user_id = p_target_user_id::text
           AND session_id IS NULL;
        UPDATE public.user_sessions
           SET is_active = false, ended_at = COALESCE(ended_at, now())
         WHERE user_id = p_target_user_id AND is_active = true;

    ELSIF p_scope = 'local' THEN
        IF p_actor_user_id IS NULL OR p_target_session_id IS NULL THEN
            RAISE EXCEPTION 'scope local exige actor_user_id e target_session_id';
        END IF;
        DELETE FROM auth.sessions
         WHERE id = p_target_session_id AND user_id = p_actor_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        UPDATE public.user_sessions
           SET is_active = false, ended_at = COALESCE(ended_at, now())
         WHERE user_id = p_actor_user_id
           AND auth_session_id = p_target_session_id
           AND is_active = true;

    ELSIF p_scope = 'others' THEN
        IF p_actor_user_id IS NULL OR p_preserve_session_id IS NULL THEN
            RAISE EXCEPTION 'scope others exige actor_user_id e preserve_session_id';
        END IF;
        DELETE FROM auth.sessions
         WHERE user_id = p_actor_user_id AND id <> p_preserve_session_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        UPDATE public.user_sessions
           SET is_active = false, ended_at = COALESCE(ended_at, now())
         WHERE user_id = p_actor_user_id
           AND auth_session_id IS DISTINCT FROM p_preserve_session_id
           AND is_active = true;
    END IF;

    RETURN v_count;
END;
$function$
