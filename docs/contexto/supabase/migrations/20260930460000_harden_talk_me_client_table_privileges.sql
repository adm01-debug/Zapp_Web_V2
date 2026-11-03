BEGIN

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY

ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY

ALTER TABLE public.queue_members ENABLE ROW LEVEL SECURITY

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY

REVOKE ALL PRIVILEGES ON TABLE
  public.contacts,
  public.messages,
  public.queues,
  public.queue_members,
  public.feature_flags,
  public.whatsapp_groups,
  public.audit_logs
FROM PUBLIC, anon

REVOKE ALL PRIVILEGES ON TABLE
  public.contacts,
  public.messages,
  public.queues,
  public.queue_members,
  public.feature_flags,
  public.whatsapp_groups
FROM authenticated, service_role

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.contacts,
  public.messages,
  public.queues,
  public.queue_members,
  public.feature_flags,
  public.whatsapp_groups
TO authenticated, service_role

REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM authenticated

GRANT SELECT ON TABLE public.audit_logs TO authenticated

REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM service_role

GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role

CREATE OR REPLACE FUNCTION public.resolve_contact_guard_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_claims jsonb;
  v_claim_role text;
  v_database_role text := NULLIF(pg_catalog.current_setting('role', true), '');
BEGIN
  BEGIN
    v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_auth_context' USING ERRCODE = '42501';
  END;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  v_claim_role := COALESCE(
    v_claims ->> 'role',
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '')
  );

  -- O bypass exige o JWT E o papel PostgreSQL service_role. Assim, alterar apenas
  -- request.jwt.claims nao transforma uma sessao authenticated em service_role.
  IF v_claim_role = 'service_role' AND v_database_role = 'service_role' THEN
    RETURN NULL;
  END IF;

  -- Jobs internos sem JWT so passam quando a conexao pertence a um superusuario.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles role_row
    WHERE role_row.rolname = SESSION_USER
      AND role_row.rolsuper IS TRUE
  ) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
END;
$function$

CREATE OR REPLACE FUNCTION public.prevent_contact_queue_hijack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := public.resolve_contact_guard_actor();
BEGIN
  IF v_user_id IS NOT NULL
     AND NEW.queue_id IS NOT NULL
     AND NOT public.is_admin_or_supervisor(v_user_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = public.get_profile_id_for_user(v_user_id)
         AND qm.is_active IS TRUE
     )
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.prevent_contact_assignee_hijack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := public.resolve_contact_guard_actor();
BEGIN
  IF v_user_id IS NOT NULL
     AND NEW.assigned_to IS NOT NULL
     AND NOT public.is_admin_or_supervisor(v_user_id)
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to
          AND p.is_active IS TRUE
          AND ur.role IN ('agent', 'supervisor', 'admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.assigned_to <> public.get_profile_id_for_user(v_user_id) THEN
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

REVOKE ALL ON FUNCTION public.resolve_contact_guard_actor()
  FROM PUBLIC, anon, authenticated, service_role

REVOKE ALL ON FUNCTION public.prevent_contact_queue_hijack()
  FROM PUBLIC, anon, authenticated, service_role

REVOKE ALL ON FUNCTION public.prevent_contact_assignee_hijack()
  FROM PUBLIC, anon, authenticated, service_role

COMMENT ON FUNCTION public.prevent_contact_queue_hijack() IS
  'Impede usuario autenticado de mover contato para fila fora do seu escopo; service_role sem identidade permanece autorizado.'

COMMENT ON FUNCTION public.prevent_contact_assignee_hijack() IS
  'Impede usuario autenticado de atribuir contato a perfil invalido; service_role sem identidade permanece autorizado.'

COMMENT ON FUNCTION public.resolve_contact_guard_actor() IS
  'Resolve o auth.uid dos guards de contacts; retorna NULL apenas para contextos internos autorizados.'

COMMIT
