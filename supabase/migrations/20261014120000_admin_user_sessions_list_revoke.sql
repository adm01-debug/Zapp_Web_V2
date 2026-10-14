-- admin_user_sessions_list_revoke
-- Rollback: DROP FUNCTION IF EXISTS public.revoke_auth_session(uuid, uuid); DROP FUNCTION IF EXISTS public.list_auth_sessions(uuid);

-- [refazer 1] admin-user-sessions-sessoes: a fonte de verdade sobre sessao e
-- auth.sessions no BANCO (mesma fonte da primitiva revoke_auth_sessions de
-- 20261004181921). A entrega anterior lia sessoes pelo endpoint admin REST do
-- GoTrue, caminho sem precedente no repo e sem prova contra o banco local.
-- Estas duas funcoes dao ao edge o que falta para a paridade V3:
--   list_auth_sessions   -> inventariar as sessoes de um usuario (tela investiga)
--   revoke_auth_session  -> encerrar UMA sessao especifica de terceiro (admin)
-- DELETE em auth.sessions remove os refresh tokens vinculados (FK
-- auth.refresh_tokens.session_id -> auth.sessions(id) ON DELETE CASCADE) e o
-- inventario public.user_sessions e mantido coerente no mesmo primitivo.
-- So service_role executa (chamada pela Edge admin-user-sessions); nunca o
-- cliente (REVOKE de PUBLIC/anon/authenticated abaixo).

-- 1. Lista as sessoes Auth reais de um usuario, da mais recente para a mais antiga.
CREATE OR REPLACE FUNCTION public.list_auth_sessions(p_target_user_id uuid)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    refreshed_at timestamptz,
    user_agent text,
    ip inet
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT s.id,
           s.created_at,
           s.updated_at,
           s.refreshed_at::timestamptz,
           s.user_agent,
           s.ip
      FROM auth.sessions s
     WHERE s.user_id = p_target_user_id
     ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_auth_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_auth_sessions(uuid) TO service_role;

-- 2. Encerra UMA sessao especifica de um usuario (admin age sobre terceiro com
-- o papel ja conferido no edge). Retorna 1 quando removeu, 0 quando a sessao
-- nao existe ou nao pertence ao alvo (o edge traduz 0 em 404 e nao audita).
CREATE OR REPLACE FUNCTION public.revoke_auth_session(p_target_user_id uuid, p_target_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    DELETE FROM auth.sessions
     WHERE id = p_target_session_id AND user_id = p_target_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        -- Cinturao e suspensorios: refresh tokens que ainda apontem para a
        -- sessao removida sao marcados como revogados.
        UPDATE auth.refresh_tokens
           SET revoked = true, updated_at = now()
         WHERE session_id = p_target_session_id;
        UPDATE public.user_sessions
           SET is_active = false, ended_at = COALESCE(ended_at, now())
         WHERE user_id = p_target_user_id
           AND auth_session_id = p_target_session_id
           AND is_active = true;
    END IF;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_auth_session(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_auth_session(uuid, uuid) TO service_role;
