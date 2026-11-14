BEGIN

SET LOCAL lock_timeout = '2s'

SET LOCAL statement_timeout = '120s'

LOCK TABLE public.user_roles, public.role_permissions, public.audit_logs,
  public.contact_protection_policy, public.multiplix_voice_grants, public.multiplix_voice_assets,
  public.multiplix_audiences, public.multiplix_audience_members, public.agent_visibility_grants,
  public.ai_providers, public.app_settings, public.blocked_ips, public.channel_connections,
  public.password_reset_requests, public.whatsapp_connections_safe
  IN ACCESS EXCLUSIVE MODE

DO $guarda$
DECLARE
  v_tem_rotulo boolean;
  v_n bigint;
  v_md5 text;
BEGIN
  IF to_regtype('public.app_role__old') IS NOT NULL THEN
    RAISE EXCEPTION 'remove_enum_special_agent: public.app_role__old ja existe (aplicacao anterior interrompida?)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'special_agent'
  ) INTO v_tem_rotulo;

  -- Corpos das 3 funcoes recriadas abaixo: iguais aos medidos em producao.
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = to_regprocedure('public.has_role(uuid,public.app_role)');
  IF v_md5 IS DISTINCT FROM 'dae5cfc5a8d92461a428f6702e4e65af' THEN
    RAISE EXCEPTION 'remove_enum_special_agent: corpo de has_role mudou (md5 %)', v_md5;
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = to_regprocedure('public.effective_role(uuid)');
  IF v_md5 IS DISTINCT FROM '07814d09481f4979ebbe0e03910835ff' THEN
    RAISE EXCEPTION 'remove_enum_special_agent: corpo de effective_role mudou (md5 %)', v_md5;
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = to_regprocedure('public.admin_set_role(uuid,public.app_role)');
  IF v_md5 IS DISTINCT FROM 'a59220e0f3abcc9e06a12b15c67129f6' THEN
    RAISE EXCEPTION 'remove_enum_special_agent: corpo de admin_set_role mudou (md5 %)', v_md5;
  END IF;

  IF NOT v_tem_rotulo THEN
    RAISE NOTICE 'remove_enum_special_agent: app_role ja sem special_agent; so reafirma o estado';
    RETURN;
  END IF;

  -- Ninguem pode estar usando o papel.
  SELECT count(*) INTO v_n FROM public.user_roles WHERE role::text = 'special_agent';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'remove_enum_special_agent: % linha(s) em user_roles com special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.profiles WHERE role = 'special_agent';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'remove_enum_special_agent: % linha(s) em profiles com special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.contact_protection_policy WHERE scope_role::text = 'special_agent';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'remove_enum_special_agent: % politica(s) de protecao para special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.multiplix_voice_grants WHERE 'special_agent' = ANY (roles::text[]);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'remove_enum_special_agent: % grant(s) de voz para special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.multiplix_audiences WHERE 'special_agent' = ANY (shared_with_roles);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'remove_enum_special_agent: % audiencia(s) compartilhada(s) com special_agent', v_n;
  END IF;

  ALTER TYPE public.app_role RENAME TO app_role__old;
  CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
END
$guarda$

DROP POLICY IF EXISTS "Agents can view own grants" ON public.agent_visibility_grants

DROP POLICY IF EXISTS "Admins can delete AI providers" ON public.ai_providers

DROP POLICY IF EXISTS "Admins can insert AI providers" ON public.ai_providers

DROP POLICY IF EXISTS "Admins can update AI providers" ON public.ai_providers

DROP POLICY IF EXISTS "Admins can view AI providers" ON public.ai_providers

DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings

DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs

DROP POLICY IF EXISTS "Only admins can view blocked IPs" ON public.blocked_ips

DROP POLICY IF EXISTS "Admins full access to channels" ON public.channel_connections

DROP POLICY IF EXISTS "Admins can delete contact protection policy" ON public.contact_protection_policy

DROP POLICY IF EXISTS "Admins can insert contact protection policy" ON public.contact_protection_policy

DROP POLICY IF EXISTS "Admins can update contact protection policy" ON public.contact_protection_policy

DROP POLICY IF EXISTS "Admins can view contact protection policy" ON public.contact_protection_policy

DROP POLICY IF EXISTS "Users can view members of accessible audiences" ON public.multiplix_audience_members

DROP POLICY IF EXISTS "Users can view own or shared audiences" ON public.multiplix_audiences

DROP POLICY IF EXISTS "Granted callers can read voice assets" ON public.multiplix_voice_assets

DROP POLICY IF EXISTS "Callers read their own voice grants" ON public.multiplix_voice_grants

DROP POLICY IF EXISTS "Admins can delete password reset requests" ON public.password_reset_requests

DROP POLICY IF EXISTS "Admins can update reset requests without token access" ON public.password_reset_requests

DROP POLICY IF EXISTS "Admins can view reset requests" ON public.password_reset_requests

DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles

DELETE FROM public.role_permissions WHERE role::text = 'special_agent'

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_no_special_agent

ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role

ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'agent'::public.app_role

ALTER TABLE public.role_permissions
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role

ALTER TABLE public.contact_protection_policy
  ALTER COLUMN scope_role TYPE public.app_role USING scope_role::text::public.app_role

ALTER TABLE public.multiplix_voice_grants
  ALTER COLUMN roles TYPE public.app_role[] USING roles::text[]::public.app_role[]

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
 RETURNS TABLE(out_user_id uuid, out_old_role public.app_role, out_new_role public.app_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_old    public.app_role;
  v_admin_count int;
BEGIN
  -- Exige sessao JWT real: service_role sem JWT tem auth.uid() nulo e cai aqui.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'jwt_session_required'
      USING HINT = 'admin_set_role exige sessao autenticada; service_role sem JWT nao pode usar esta RPC';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Nao permite que um admin remova o proprio admin e trave a instalacao.
  IF _user_id = v_caller AND _role <> 'admin'::public.app_role THEN
    RAISE EXCEPTION 'cannot_demote_self';
  END IF;

  SELECT ur.role INTO v_old FROM public.user_roles ur WHERE ur.user_id = _user_id LIMIT 1;

  -- Piso de admin: nao deixa zerar o ultimo administrador da instalacao.
  IF v_old = 'admin'::public.app_role AND _role <> 'admin'::public.app_role THEN
    SELECT count(*) INTO v_admin_count FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_admin'
        USING HINT = 'a instalacao precisa de pelo menos 1 administrador';
    END IF;
  END IF;

  IF v_old IS NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
  ELSIF v_old IS DISTINCT FROM _role THEN
    UPDATE public.user_roles ur SET role = _role WHERE ur.user_id = _user_id;
  END IF;

  -- audit_user_role_changes dispara sozinho no INSERT/UPDATE acima, ja com
  -- changed_by = auth.uid() preenchido (sessao JWT garantida no guard).
  RETURN QUERY SELECT _user_id, v_old, _role;
END;
$function$

REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) TO authenticated, service_role

COMMENT ON FUNCTION public.admin_set_role(uuid, public.app_role) IS
  'Troca o papel de um usuario exigindo sessao JWT de admin. Unico caminho de troca de papel com autoria garantida em audit_logs. service_role sem JWT recebe jwt_session_required.'

CREATE OR REPLACE VIEW public.whatsapp_connections_safe WITH (security_invoker = true) AS
 SELECT id,
    name,
    phone_number,
    status,
    is_default,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN qr_code
            ELSE NULL::text
        END AS qr_code,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN instance_id
            ELSE NULL::text
        END AS instance_id,
    farewell_message,
    farewell_enabled,
    battery_level,
    is_plugged,
    retry_count,
    max_retries,
    last_health_check,
    health_status,
    health_response_ms,
    created_by,
    created_at,
    updated_at,
    health_reason
   FROM public.whatsapp_connections

DROP FUNCTION IF EXISTS public.effective_role(uuid)

CREATE FUNCTION public.effective_role(_user_id uuid)
 RETURNS public.app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    ELSE 'agent'::app_role
  END
  FROM public.user_roles
  WHERE user_id = _user_id
$function$

REVOKE ALL ON FUNCTION public.effective_role(uuid) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.effective_role(uuid) TO service_role

DO $limpa$
BEGIN
  IF to_regtype('public.app_role__old') IS NOT NULL THEN
    DROP FUNCTION IF EXISTS public.admin_set_role(uuid, public.app_role__old);
    DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role__old);
    DROP TYPE public.app_role__old;
  END IF;
END
$limpa$

ALTER FUNCTION public.sync_profile_role_from_user_roles() SET search_path TO 'public', 'pg_temp'

ALTER FUNCTION public.get_my_protection_policy() SET search_path TO 'public', 'pg_temp'

ALTER FUNCTION public.multiplix_audiences_validate_shared_roles() SET search_path TO 'public'

CREATE POLICY "Agents can view own grants"
  ON public.agent_visibility_grants FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'agent'::public.app_role)
    AND agent_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  )

CREATE POLICY "Admins can delete AI providers"
  ON public.ai_providers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can insert AI providers"
  ON public.ai_providers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can update AI providers"
  ON public.ai_providers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can view AI providers"
  ON public.ai_providers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "app_settings_admin_all"
  ON public.app_settings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid() AS uid) AND ur.role = 'admin'::public.app_role
    )
  )

CREATE POLICY "Only admins can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))

CREATE POLICY "Only admins can view blocked IPs"
  ON public.blocked_ips FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::public.app_role
    )
    OR public.is_admin_or_supervisor(auth.uid())
  )

CREATE POLICY "Admins full access to channels"
  ON public.channel_connections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can delete contact protection policy"
  ON public.contact_protection_policy FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can insert contact protection policy"
  ON public.contact_protection_policy FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can update contact protection policy"
  ON public.contact_protection_policy FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can view contact protection policy"
  ON public.contact_protection_policy FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Users can view members of accessible audiences"
  ON public.multiplix_audience_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_audiences ma
      WHERE ma.id = multiplix_audience_members.audience_id
        AND (
          ma.owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR EXISTS (
            SELECT 1 FROM unnest(ma.shared_with_roles) shared(role_name)
            WHERE public.has_role(auth.uid(), (shared.role_name)::public.app_role)
          )
        )
    )
  )

CREATE POLICY "Users can view own or shared audiences"
  ON public.multiplix_audiences FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM unnest(multiplix_audiences.shared_with_roles) shared(role_name)
      WHERE public.has_role(auth.uid(), (shared.role_name)::public.app_role)
    )
  )

CREATE POLICY "Granted callers can read voice assets"
  ON public.multiplix_voice_assets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_voice_grants g
      WHERE g.voice_id = multiplix_voice_assets.voice_id
        AND g.revoked_at IS NULL
        AND (
          (g.roles IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(g.roles) r(r) WHERE public.has_role(auth.uid(), r.r)
          ))
          OR (g.perfis IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = ANY (g.perfis)
          ))
        )
    )
    OR created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  )

CREATE POLICY "Callers read their own voice grants"
  ON public.multiplix_voice_grants FOR SELECT TO authenticated
  USING (
    revoked_at IS NULL
    AND (
      (roles IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(multiplix_voice_grants.roles) r(r) WHERE public.has_role(auth.uid(), r.r)
      ))
      OR (perfis IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.id = ANY (multiplix_voice_grants.perfis)
      ))
    )
  )

CREATE POLICY "Admins can delete password reset requests"
  ON public.password_reset_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can update reset requests without token access"
  ON public.password_reset_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Admins can view reset requests"
  ON public.password_reset_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))

DO $pos$
DECLARE
  v_rotulos text;
  v_n bigint;
BEGIN
  SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) INTO v_rotulos
    FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;
  IF v_rotulos IS DISTINCT FROM 'admin,supervisor,agent' THEN
    RAISE EXCEPTION 'pos: rotulos de app_role = %', v_rotulos;
  END IF;
  IF to_regtype('public.app_role__old') IS NOT NULL THEN
    RAISE EXCEPTION 'pos: app_role__old sobrou';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('has_role', 'admin_set_role', 'effective_role');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'pos: esperava 3 funcoes (has_role, admin_set_role, effective_role), achou %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%special_agent%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'pos: % policy(ies) ainda citam special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc ILIKE '%special_agent%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'pos: % funcao(oes) ainda citam special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) ILIKE '%special_agent%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'pos: % constraint(s) ainda citam special_agent', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy pol
   WHERE (pol.polrelid, pol.polname) IN (
     ('public.agent_visibility_grants'::regclass, 'Agents can view own grants'),
     ('public.ai_providers'::regclass, 'Admins can delete AI providers'),
     ('public.ai_providers'::regclass, 'Admins can insert AI providers'),
     ('public.ai_providers'::regclass, 'Admins can update AI providers'),
     ('public.ai_providers'::regclass, 'Admins can view AI providers'),
     ('public.app_settings'::regclass, 'app_settings_admin_all'),
     ('public.audit_logs'::regclass, 'Only admins can view audit logs'),
     ('public.blocked_ips'::regclass, 'Only admins can view blocked IPs'),
     ('public.channel_connections'::regclass, 'Admins full access to channels'),
     ('public.contact_protection_policy'::regclass, 'Admins can delete contact protection policy'),
     ('public.contact_protection_policy'::regclass, 'Admins can insert contact protection policy'),
     ('public.contact_protection_policy'::regclass, 'Admins can update contact protection policy'),
     ('public.contact_protection_policy'::regclass, 'Admins can view contact protection policy'),
     ('public.multiplix_audience_members'::regclass, 'Users can view members of accessible audiences'),
     ('public.multiplix_audiences'::regclass, 'Users can view own or shared audiences'),
     ('public.multiplix_voice_assets'::regclass, 'Granted callers can read voice assets'),
     ('public.multiplix_voice_grants'::regclass, 'Callers read their own voice grants'),
     ('public.password_reset_requests'::regclass, 'Admins can delete password reset requests'),
     ('public.password_reset_requests'::regclass, 'Admins can update reset requests without token access'),
     ('public.password_reset_requests'::regclass, 'Admins can view reset requests'),
     ('public.user_roles'::regclass, 'Only admins can manage roles')
   );
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'pos: esperava 21 policies recriadas, achou %', v_n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.whatsapp_connections_safe'::regclass
       AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'pos: whatsapp_connections_safe perdeu security_invoker';
  END IF;
  IF has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_role(uuid, public.app_role)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.effective_role(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos: ACL das funcoes recriadas mais larga que a de producao';
  END IF;
END
$pos$

NOTIFY pgrst, 'reload schema'

COMMIT
