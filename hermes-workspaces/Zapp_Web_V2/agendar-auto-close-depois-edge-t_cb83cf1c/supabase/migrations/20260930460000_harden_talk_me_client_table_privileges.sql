-- TALK ME / Inbox / Contatos: menor privilegio nas tabelas do fluxo e guards
-- caller-bound para mudancas de fila/responsavel.
--
-- O Data API usa os papeis anon/authenticated, mas RLS nao protege TRUNCATE,
-- REFERENCES, TRIGGER nem MAINTAIN. Grants historicos ainda deixavam esses
-- privilegios nos papeis cliente. Reconstruimos as ACLs com apenas o DML usado
-- pelo produto e preservamos as policies existentes como filtro por linha.
--
-- Os dois triggers de contacts antes decidiam se protegiam a linha apenas por
-- request.jwt.claims.role. Agora qualquer sessao com auth.uid() e tratada como
-- usuario final, independentemente do texto do role. O service_role padrao e os
-- jobs internos continuam livres somente quando nao carregam identidade de
-- usuario. Um contexto "authenticated" sem sub falha fechado.

BEGIN;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Nenhuma destas tabelas faz parte de um fluxo publico/pre-login.
REVOKE ALL PRIVILEGES ON TABLE
  public.contacts,
  public.messages,
  public.queues,
  public.queue_members,
  public.feature_flags,
  public.whatsapp_groups,
  public.audit_logs
FROM PUBLIC, anon;

-- O frontend autenticado usa CRUD nestas tabelas; RLS continua sendo a
-- autoridade sobre quais linhas podem ser lidas ou alteradas.
-- whatsapp_groups entra no mesmo contrato: a ACL canonica ainda concedia
-- TRUNCATE/REFERENCES/TRIGGER aos tres papeis da API, enquanto os fluxos em
-- src/hooks/groups/actions.ts usam apenas CRUD e as leituras usam SELECT.
REVOKE ALL PRIVILEGES ON TABLE
  public.contacts,
  public.messages,
  public.queues,
  public.queue_members,
  public.feature_flags,
  public.whatsapp_groups
FROM authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.contacts,
  public.messages,
  public.queues,
  public.queue_members,
  public.feature_flags,
  public.whatsapp_groups
TO authenticated, service_role;

-- Usuarios leem auditoria apenas quando a policy administrativa permite. Toda
-- escrita direta permanece fechada; funcoes SECURITY DEFINER escrevem como o
-- owner e nao dependem deste grant.
-- Evidencia de uso revisada em 2026-10-01: src/ so faz SELECT direto; o teste de
-- fronteira exige que DELETE falhe; entre as Edge Functions, apenas
-- elevenlabs-webhook faz INSERT. Nao ha UPDATE/DELETE direto em audit_logs.
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- Edge Functions e jobs precisam de DML, nunca de DDL de tabela. audit_logs e
-- append-only para service_role: leitura e insercao, sem reescrita ou exclusao.
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role;

-- Resolve uma unica vez o ator efetivo usado pelos guards de contacts. NULL e
-- reservado aos dois contextos internos autorizados: service_role real sem uid
-- e conexao direta de superusuario. Qualquer sessao com uid continua sendo
-- tratada como usuario, ainda que tente alegar role=service_role no JWT.
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
$function$;

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
$function$;

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
$function$;

-- Funcoes internas nao precisam de EXECUTE direto pelos papeis da API.
REVOKE ALL ON FUNCTION public.resolve_contact_guard_actor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_contact_queue_hijack()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_contact_assignee_hijack()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.prevent_contact_queue_hijack() IS
  'Impede usuario autenticado de mover contato para fila fora do seu escopo; service_role sem identidade permanece autorizado.';
COMMENT ON FUNCTION public.prevent_contact_assignee_hijack() IS
  'Impede usuario autenticado de atribuir contato a perfil invalido; service_role sem identidade permanece autorizado.';
COMMENT ON FUNCTION public.resolve_contact_guard_actor() IS
  'Resolve o auth.uid dos guards de contacts; retorna NULL apenas para contextos internos autorizados.';

COMMIT;
