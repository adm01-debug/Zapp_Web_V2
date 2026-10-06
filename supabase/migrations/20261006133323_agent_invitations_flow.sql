-- agent_invitations_flow
-- Rollback: DROP FUNCTION IF EXISTS public.accept_agent_invite(text); DROP FUNCTION IF EXISTS public.list_agent_invites(integer); DROP FUNCTION IF EXISTS public.create_agent_invite(text, text, text, integer); DROP TABLE IF EXISTS public.agent_invitations;
-- versao 20261006133323 reservada para hermes-convite-agente-nao-autenticavel-2610061030562b (hermes-db-migrar --nova)
--
-- R2-AUTH-015: o convite de agente so mandava e-mail e prometia o papel no texto. Aqui nasce o
-- convite de verdade: destinatario, papel autorizado, expiracao e consumo unico; a atribuicao do
-- papel e decidida pelo SERVIDOR na aceitacao, a partir da linha do convite (nunca do texto do
-- e-mail nem de metadata enviada pelo convidado).

CREATE TABLE IF NOT EXISTS public.agent_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  role text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 1,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at timestamptz,
  used_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_invitations_email_normalized CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  CONSTRAINT agent_invitations_role_allowed CHECK (role IN ('agent', 'supervisor', 'admin')),
  CONSTRAINT agent_invitations_status_allowed CHECK (status IN ('pending', 'used', 'revoked')),
  CONSTRAINT agent_invitations_code_format CHECK (length(code) BETWEEN 6 AND 64),
  CONSTRAINT agent_invitations_expires_after_created CHECK (expires_at > created_at),
  CONSTRAINT agent_invitations_single_use CHECK (max_uses = 1),
  CONSTRAINT agent_invitations_use_count_range CHECK (use_count >= 0 AND use_count <= max_uses)
);

-- Um convite PENDENTE por e-mail: repetir o convite nao deixa dois codigos validos ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS agent_invitations_pending_email_uniq
  ON public.agent_invitations (email) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_agent_invitations_code_pending
  ON public.agent_invitations (code) WHERE status = 'pending';

ALTER TABLE public.agent_invitations ENABLE ROW LEVEL SECURITY;

-- Sem acesso direto (nem leitura): o convite e usado apenas pelas RPCs desta migration
-- (SECURITY DEFINER, que conferem quem chama) e pelo service_role.
REVOKE ALL ON TABLE public.agent_invitations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_agent_invite(
  p_email text,
  p_name text DEFAULT NULL,
  p_role text DEFAULT 'agent',
  p_expires_hours integer DEFAULT 72
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_email text;
  v_code text;
  v_expires_at timestamptz;
  v_id uuid;
  v_existing boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT public.is_admin_or_supervisor(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_email := lower(btrim(coalesce(p_email, '')));
  IF position('@' in v_email) <= 1 OR v_email ~ '\s' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('agent', 'supervisor', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- papel autorizado: so um admin convida outro admin
  IF p_role = 'admin' AND NOT public.is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  v_expires_at := now() + (least(greatest(coalesce(p_expires_hours, 72), 1), 720) || ' hours')::interval;
  v_code := upper(substring(replace(encode(gen_random_bytes(9), 'base64'), '/', 'A'), 1, 12));

  BEGIN
    INSERT INTO public.agent_invitations (email, name, role, code, expires_at, created_by, status)
    VALUES (v_email, nullif(btrim(coalesce(p_name, '')), ''), p_role, v_code, v_expires_at, v_profile_id, 'pending')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_pending');
  END;

  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) INTO v_existing;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'agent_invite_created', 'agent_invitations', v_id,
          jsonb_build_object('email', v_email, 'role', p_role, 'expires_at', v_expires_at, 'existing_account', v_existing));

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_id,
    'code', v_code,
    'role', p_role,
    'email', v_email,
    'expires_at', v_expires_at,
    'existing_account', v_existing
  );
END;
$f$;

CREATE OR REPLACE FUNCTION public.accept_agent_invite(p_code text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_caller_email text;
  v_inv public.agent_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- identidade de verdade: e-mail da conta autenticada (auth.users), nunca o que o convidado digita
  SELECT lower(u.email) INTO v_caller_email FROM auth.users u WHERE u.id = v_uid;

  SELECT * INTO v_inv
  FROM public.agent_invitations i
  WHERE i.code = upper(btrim(coalesce(p_code, '')))
    AND i.status = 'pending'
    AND i.expires_at > now()
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  IF v_caller_email IS NULL OR v_caller_email <> v_inv.email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  -- consumo unico: a linha sai de 'pending' e uma segunda aceitacao nao encontra mais o convite
  UPDATE public.agent_invitations
     SET use_count = 1, used_at = now(), used_by = v_profile_id, status = 'used'
   WHERE id = v_inv.id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  -- atribuicao server-side do papel do convite (o trigger de sync espelha em profiles.role)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, v_inv.role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'agent_invite_accepted', 'agent_invitations', v_inv.id,
          jsonb_build_object('email', v_inv.email, 'role', v_inv.role));

  RETURN jsonb_build_object('ok', true, 'invite_id', v_inv.id, 'email', v_inv.email, 'role', v_inv.role);
END;
$f$;

CREATE OR REPLACE FUNCTION public.list_agent_invites(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  status text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_supervisor(v_uid) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT i.id,
           i.email,
           i.name,
           i.role,
           CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
           i.expires_at,
           i.used_at,
           i.created_at
      FROM public.agent_invitations i
     ORDER BY i.created_at DESC
     LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$f$;

REVOKE ALL ON FUNCTION public.create_agent_invite(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_agent_invite(text, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_agent_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_agent_invite(text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_agent_invites(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_agent_invites(integer) TO authenticated;
