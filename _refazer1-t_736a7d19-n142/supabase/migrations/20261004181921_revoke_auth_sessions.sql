-- revoke_auth_sessions
-- Rollback: DROP TRIGGER IF EXISTS trg_revoke_sessions_on_profile_deactivate ON public.profiles; DROP FUNCTION IF EXISTS public.trg_revoke_sessions_on_profile_deactivate(); DROP FUNCTION IF EXISTS public.revoke_auth_sessions(text,uuid,uuid,uuid,uuid); DROP TRIGGER IF EXISTS trg_user_sessions_auth_session_guard ON public.user_sessions; DROP FUNCTION IF EXISTS public.trg_user_sessions_auth_session_guard(); DROP INDEX IF EXISTS idx_user_sessions_auth_session_id; DROP INDEX IF EXISTS idx_user_sessions_user_auth_session; ALTER TABLE public.user_sessions DROP COLUMN IF EXISTS auth_session_id;

-- R2-AUTH-004 (item 6): primitiva server-side de revogação Auth.
-- Sessões/refresh tokens Auth reais são revogados via DELETE em auth.sessions
-- (a FK auth.refresh_tokens.session_id -> auth.sessions(id) ON DELETE CASCADE
--  remove os refresh tokens vinculados). O inventário público user_sessions é
-- mantido coerente (is_active=false, ended_at) pelo mesmo primitivo.
-- A função só é executável por service_role (chamada pela Edge Function
-- revoke-auth-sessions) e pelos triggers server-side; nunca diretamente pelo
-- cliente (REVOKE de PUBLIC/anon/authenticated abaixo).

-- 1. Vínculo opcional entre o inventário público e a sessão Auth real.
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS auth_session_id uuid;

-- 2. Unicidade: uma sessão Auth mapeia para no máximo uma linha do inventário.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_auth_session_id
  ON public.user_sessions (auth_session_id)
  WHERE auth_session_id IS NOT NULL;

-- 3. Índice para o revoke por (usuário, sessão Auth).
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_auth_session
  ON public.user_sessions (user_id, auth_session_id);

-- 4. Guarda contra associação cruzada: auth_session_id só pode apontar para uma
-- sessão Auth do MESMO usuário. SECURITY DEFINER para ler auth.sessions.
CREATE OR REPLACE FUNCTION public.trg_user_sessions_auth_session_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.auth_session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id = NEW.auth_session_id AND s.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'auth_session_id nao pertence a este usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_sessions_auth_session_guard ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_auth_session_guard
  BEFORE INSERT OR UPDATE OF auth_session_id ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_user_sessions_auth_session_guard();

-- 5. Primitiva de revogação. p_actor_user_id é o usuário autenticado (usado
-- para impor self-only em local/others); p_target_user_id é o alvo de global;
-- p_target_session_id é o alvo de local; p_preserve_session_id é a sessão
-- preservada em others.
CREATE OR REPLACE FUNCTION public.revoke_auth_sessions(
    p_scope text,
    p_actor_user_id uuid DEFAULT NULL,
    p_target_user_id uuid DEFAULT NULL,
    p_target_session_id uuid DEFAULT NULL,
    p_preserve_session_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- Fecha a porta para o cliente: só service_role executa via RPC.
REVOKE ALL ON FUNCTION public.revoke_auth_sessions(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_auth_sessions(text, uuid, uuid, uuid, uuid) TO service_role;

-- 6. Desativar perfil revoga todas as sessões Auth reais do usuário (trigger
-- server-side, mesma primitiva). Reativar não cria sessão (só dispara em false).
CREATE OR REPLACE FUNCTION public.trg_revoke_sessions_on_profile_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active = false THEN
    PERFORM public.revoke_auth_sessions('global', NULL, NEW.user_id, NULL, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_sessions_on_profile_deactivate ON public.profiles;
CREATE TRIGGER trg_revoke_sessions_on_profile_deactivate
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_revoke_sessions_on_profile_deactivate();
