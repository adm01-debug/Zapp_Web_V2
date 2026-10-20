#!/usr/bin/env bash
# Contrato de escopo de conexao no envio (L7 da matriz docs/ia/IA-004-matriz-autorizacao.md).
#
# Causa raiz: enqueue_outbound_message aceitava qualquer conexao 'connected' informada em
# p_whatsapp_connection_id (e, sem parametro, caia no fallback "qualquer conexao conectada
# mais recente") sem checar se a conexao esta no escopo do chamador. Nem as policies de
# leitura de conexao nem a RPC distinguiam fila.
#
# BLOCO A (antes): um agente SEM vinculo com a fila da conexao envia por ela (defeito).
# BLOCO B (depois): o mesmo envio e recusado com 42501 whatsapp_connection_out_of_scope;
#   quem e membro da fila segue enviando; admin/supervisor segue escolhendo qualquer uma;
#   a conexao do proprio contato segue valendo; conexao SEM vinculo de fila continua
#   utilizavel (inerte por construcao enquanto a tabela de vinculos nao estiver
#   configurada); e a guarda de permissao do L9 continua valendo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql"
group_migration="$repo_root/supabase/migrations/20261011155946_enqueue_group_outbound_message.sql"
postgres_image="${ENQUEUE_SCOPE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-enqueue-scope-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-enqueue-scope-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$group_migration" ]] || fail "migration de grupo nao encontrada: $group_migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text, category text
);
CREATE TABLE public.role_permissions (
  role text NOT NULL, permission_id uuid NOT NULL REFERENCES public.permissions(id),
  PRIMARY KEY (role, permission_id)
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = _user_id AND p.name = _permission_name) $$;

-- ADM e admin/supervisor (predicado do projeto, usado nas policies como is_admin_or_supervisor(auth.uid())).
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT _user_id = '99999999-9999-9999-9999-999999999999'::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, name text, status text NOT NULL, instance_id text, is_default boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.whatsapp_connection_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), whatsapp_connection_id uuid NOT NULL, queue_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_id uuid NOT NULL, profile_id uuid NOT NULL,
  is_active boolean DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id), phone text);
-- whatsapp_groups espelha a tabela real (id, whatsapp_connection_id, group_id = JID).
CREATE TABLE public.whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  group_id text NOT NULL, name text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- messages: contact_id e NULLABLE no schema real (destino de grupo); colunas de lease do delivery.
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  client_message_id uuid, whatsapp_connection_id uuid, agent_id uuid,
  sender text, content text, message_type text, media_url text, caption text,
  reply_to_id uuid, is_read boolean, status text, external_id text, status_updated_at timestamptz,
  media_filename text, media_mimetype text,
  delivery_claim_token uuid, delivery_claimed_at timestamptz, delivery_claim_expires_at timestamptz,
  delivery_claimed_by text, delivery_last_claim_token uuid,
  delivery_attempt_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messages_contact_client_msg_uq
  ON public.messages (contact_id, client_message_id) WHERE client_message_id IS NOT NULL;
-- service_role le as tabelas da fila em producao (as Edge Functions usam esse papel).
GRANT SELECT ON public.messages, public.contacts, public.whatsapp_groups,
  public.whatsapp_connections, public.profiles TO service_role;

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT true $$;

-- Corpo ATUAL de producao da RPC (ja com a guarda de permissao do L9, sem o escopo do L7).
CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(
  p_contact_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_message_type text DEFAULT 'text',
  p_media_url text DEFAULT NULL,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL,
  p_caption text DEFAULT NULL
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile_id uuid;
  v_connection_id uuid;
  v_assigned_connection_id uuid;
  v_reply_contact_id uuid;
  v_message public.messages%ROWTYPE;
  v_message_type text := COALESCE(NULLIF(p_message_type, ''), 'text');
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  -- L9 (docs/ia/IA-004-matriz-autorizacao.md): a permissao send_messages so era
  -- checada no cliente (hasPermission sobre um array). Esconder o botao nao impedia
  -- a acao: qualquer authenticated enfileirava mensagem por esta RPC. A checagem passa
  -- a ser imposta aqui, no banco. user_has_permission() e SECURITY DEFINER e casa
  -- user_roles.user_id com o auth.uid() do chamador (nao com profiles.id).
  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;

  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR length(COALESCE(p_caption, '')) > 65536
     OR (p_media_url IS NOT NULL AND p_media_url !~ '^https://')
     OR (v_message_type NOT IN ('text', 'location') AND p_media_url IS NULL)
     OR (v_message_type = 'location' AND p_media_url IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_outbound_message' USING ERRCODE = '22023';
  END IF;
  SELECT contact.whatsapp_connection_id INTO v_assigned_connection_id
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  -- Preserve the established inbox behavior for legacy contacts that predate
  -- per-contact connection assignment. The resolved connection is persisted on
  -- the queued message, making the subsequent lease deterministic.
  -- An explicit operator choice takes precedence, but must be a live
  -- connection. Otherwise use the assigned connection only while it is live,
  -- then deliberately fall back for historical/disconnected assignments.
  IF p_whatsapp_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = p_whatsapp_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL;
    IF v_connection_id IS NULL THEN
      RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
    END IF;
  ELSIF v_assigned_connection_id IS NOT NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.id = v_assigned_connection_id
      AND connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL;
  END IF;
  IF v_connection_id IS NULL THEN
    SELECT connection.id INTO v_connection_id
    FROM public.whatsapp_connections AS connection
    WHERE connection.status = 'connected'
      AND NULLIF(connection.instance_id, '') IS NOT NULL
    ORDER BY connection.updated_at DESC, connection.id
    LIMIT 1;
  END IF;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'no_connected_whatsapp_connection' USING ERRCODE = '22023';
  END IF;
  SELECT profile.id INTO v_profile_id
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid() AND profile.is_active = true
  LIMIT 1
  FOR SHARE;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF public.is_contact_visible_to_user(p_contact_id, auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_reply_to_id IS NOT NULL THEN
    SELECT reply.contact_id INTO v_reply_contact_id
    FROM public.messages AS reply WHERE reply.id = p_reply_to_id;
    IF NOT FOUND OR v_reply_contact_id IS DISTINCT FROM p_contact_id THEN
      RAISE EXCEPTION 'reply_message_contact_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_contact_id::text || ':' || p_client_message_id::text, 0)
  );

  INSERT INTO public.messages (
    contact_id, client_message_id, whatsapp_connection_id, agent_id,
    sender, content, message_type, media_url, caption, reply_to_id,
    is_read, status, external_id, status_updated_at
  ) VALUES (
    p_contact_id, p_client_message_id, v_connection_id, v_profile_id,
    'agent', p_content, v_message_type, p_media_url, p_caption, p_reply_to_id,
    true, 'sending', NULL, statement_timestamp()
  )
  ON CONFLICT (contact_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  DO NOTHING RETURNING * INTO v_message;

  IF v_message.id IS NULL THEN
    SELECT * INTO v_message
    FROM public.messages AS message
    WHERE message.contact_id = p_contact_id
      AND message.client_message_id = p_client_message_id;
    IF v_message.id IS NULL
       OR v_message.agent_id IS DISTINCT FROM v_profile_id
       OR v_message.sender IS DISTINCT FROM 'agent'
       OR v_message.content IS DISTINCT FROM p_content
       OR v_message.message_type IS DISTINCT FROM v_message_type
       OR v_message.media_url IS DISTINCT FROM p_media_url
       OR v_message.caption IS DISTINCT FROM p_caption
       OR v_message.reply_to_id IS DISTINCT FROM p_reply_to_id
       OR v_message.whatsapp_connection_id IS DISTINCT FROM v_connection_id THEN
      RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text
) TO authenticated;

-- claim/complete ATUAIS de producao (corpo de 20260909220000 + telefone normalizado de
-- 20260909270000): a fila de delivery so resolvia destino via JOIN contacts. E o estado
-- ANTES da migration de grupo que este arquivo verifica.
CREATE OR REPLACE FUNCTION public.claim_outbound_message(
  p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(
  message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text,
  message_type text, media_url text, caption text, media_filename text, media_mimetype text,
  reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid,
  whatsapp_instance_name text, contact_phone text, claim_token uuid,
  claim_expires_at timestamptz, delivery_attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_agent_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_delivery_claim' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT message.id, connection.id AS resolved_connection_id
    FROM public.messages AS message
    JOIN public.contacts AS contact ON contact.id = message.contact_id
    JOIN public.whatsapp_connections AS connection
      ON connection.id = COALESCE(message.whatsapp_connection_id, contact.whatsapp_connection_id)
     AND connection.status = 'connected'
     AND NULLIF(connection.instance_id, '') IS NOT NULL
    WHERE message.id = p_message_id
      AND message.agent_id = p_agent_id
      AND message.sender = 'agent'
      AND message.status = 'sending'
      AND message.external_id IS NULL
      AND message.client_message_id IS NOT NULL
      AND regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$'
      AND (message.delivery_claim_token IS NULL
        OR message.delivery_claim_expires_at <= statement_timestamp())
    FOR UPDATE OF message SKIP LOCKED
  ), claimed AS (
    UPDATE public.messages AS message
    SET delivery_claim_token = gen_random_uuid(),
        delivery_claimed_at = statement_timestamp(),
        delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
        delivery_claimed_by = p_worker,
        delivery_attempt_count = message.delivery_attempt_count + 1,
        whatsapp_connection_id = candidate.resolved_connection_id,
        updated_at = statement_timestamp()
    FROM candidate WHERE message.id = candidate.id RETURNING message.*
  )
  SELECT claimed.id, claimed.client_message_id, claimed.contact_id, claimed.agent_id,
         claimed.content, claimed.message_type, claimed.media_url, claimed.caption,
         claimed.media_filename, claimed.media_mimetype, claimed.reply_to_id, reply.external_id,
         claimed.whatsapp_connection_id, connection.instance_id,
         regexp_replace(contact.phone, '\D', '', 'g'),
         claimed.delivery_claim_token, claimed.delivery_claim_expires_at,
         claimed.delivery_attempt_count
  FROM claimed
  JOIN public.contacts AS contact ON contact.id = claimed.contact_id
  JOIN public.whatsapp_connections AS connection ON connection.id = claimed.whatsapp_connection_id
  LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_outbound_message(
  p_message_id uuid, p_claim_token uuid, p_external_id text, p_delivery_status text DEFAULT 'sent'
) RETURNS public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_claim_token IS NULL
     OR length(btrim(COALESCE(p_external_id, ''))) NOT BETWEEN 1 AND 512
     OR p_delivery_status IS NULL
     OR p_delivery_status NOT IN ('sent', 'delivered', 'read') THEN
    RAISE EXCEPTION 'invalid_delivery_completion' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_message FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_message.external_id = btrim(p_external_id)
     AND v_message.status IN ('sent', 'delivered', 'read')
     AND v_message.delivery_claim_token IS NULL
     AND v_message.delivery_last_claim_token = p_claim_token THEN
    RETURN v_message;
  END IF;
  IF v_message.delivery_claim_token IS DISTINCT FROM p_claim_token
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.messages
  SET external_id = btrim(p_external_id), status = p_delivery_status,
      status_updated_at = statement_timestamp(), delivery_claim_token = NULL,
      delivery_claimed_at = NULL, delivery_claim_expires_at = NULL,
      delivery_claimed_by = NULL, delivery_last_claim_token = p_claim_token,
      updated_at = statement_timestamp()
  WHERE id = p_message_id RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_outbound_message(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_outbound_message(uuid, uuid, text, text) TO service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.messages;
DELETE FROM public.whatsapp_groups;
DELETE FROM public.queue_members;
DELETE FROM public.whatsapp_connection_queues;
DELETE FROM public.queues;
DELETE FROM public.contacts;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;
DELETE FROM public.user_roles;
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

INSERT INTO public.permissions (id, name) VALUES ('f0000000-0000-0000-0000-000000000001', 'send_messages');
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', 'f0000000-0000-0000-0000-000000000001'),
  ('admin', 'f0000000-0000-0000-0000-000000000001');
-- CARLA e DORA sao agent (tem send_messages); ADM e admin e entra tambem pelo predicado de admin/supervisor.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'agent'),
  ('22222222-2222-2222-2222-222222222222', 'agent'),
  ('99999999-9999-9999-9999-999999999999', 'admin');
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('bb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true),
  ('cc000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', true);

INSERT INTO public.whatsapp_connections (id, name, status, instance_id, is_default) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Conexao da fila', 'connected', 'inst-q', false),
  ('e0000000-0000-0000-0000-000000000002', 'Conexao sem fila', 'connected', 'inst-free', true);
INSERT INTO public.queues (id, name) VALUES ('90000000-0000-0000-0000-000000000001', 'Fila Suporte');
-- so a primeira conexao esta vinculada a fila; a segunda nao tem vinculo (inerte).
INSERT INTO public.whatsapp_connection_queues (whatsapp_connection_id, queue_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001');
-- CARLA e ADM sao membros da fila; DORA nao e.
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('90000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', true),
  ('90000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', true);
INSERT INTO public.contacts (id, whatsapp_connection_id, phone) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '5511911111111'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', '5511922222222'),
  ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', '5511933333333');
-- Grupos: g_fila na conexao da fila; g_free na conexao sem vinculo; g_bad com JID invalido;
-- g_sem_conn sem conexao (fallback) para cobrir o ramo de resolucao.
INSERT INTO public.whatsapp_groups (id, whatsapp_connection_id, group_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '120363000000000000@g.us', 'Grupo Fila'),
  ('a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', '5511999999999-1234567890@g.us', 'Grupo Free'),
  ('a0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'sem-jid-valido', 'Grupo Invalido'),
  ('a0000000-0000-0000-0000-000000000004', NULL, '120363111111111111@g.us', 'Grupo Sem Conexao');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

CARLA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
ADM='{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}'
NO_PERM='{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}'

contact_fila='c0000000-0000-0000-0000-000000000001'
contact_free='c0000000-0000-0000-0000-000000000002'
contact_other='c0000000-0000-0000-0000-000000000003'
conn_fila='e0000000-0000-0000-0000-000000000001'
conn_free='e0000000-0000-0000-0000-000000000002'
g_fila='a0000000-0000-0000-0000-000000000001'
g_free='a0000000-0000-0000-0000-000000000002'
g_bad='a0000000-0000-0000-0000-000000000003'
g_sem='a0000000-0000-0000-0000-000000000004'

enq() { # $1=contact $2=connection $3=cid $4=texto  (sem ponto-e-virgula; conexao vazia -> NULL)
  local conn="NULL"
  [[ -n "$2" ]] && conn="'$2'::uuid"
  printf "SELECT public.enqueue_outbound_message('%s'::uuid,'%s'::uuid,'%s','text',NULL,NULL,%s)" "$1" "$3" "$4" "$conn"
}

enqg() { # $1=group $2=connection $3=cid $4=texto  (RPC de grupo)
  local conn="NULL"
  [[ -n "$2" ]] && conn="'$2'::uuid"
  printf "SELECT public.enqueue_group_outbound_message('%s'::uuid,'%s'::uuid,'%s','text',NULL,NULL,%s)" "$1" "$3" "$4" "$conn"
}

enqg_group_missing() { printf "SELECT public.enqueue_group_outbound_message('%s'::uuid,'%s'::uuid,'oi','text',NULL,NULL,NULL)" "$g_fila" 'e0000000-0000-0000-0000-0000000000c0'; }

echo '-- BLOCO A: ANTES da migration (o defeito) ------------------------------------------'

expect_value 'A1 DORA (fora da fila) envia pela conexao DA FILA num contato de OUTRA conexao -- defeito do L7' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); SELECT count(*) FROM ($(enq $contact_other $conn_fila d0000000-0000-0000-0000-00000000000a 'oi dora')) q;"
expect_value 'A2 a mensagem saiu pela conexao da fila' '1' \
  "SELECT count(*) FROM public.messages WHERE whatsapp_connection_id = '$conn_fila'"

echo
echo '-- Aplicando a migration ------------------------------------------------------------'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'

expect_error 'B1 DORA (fora da fila) e recusada com 42501 whatsapp_connection_out_of_scope' \
  'whatsapp_connection_out_of_scope' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); $(enq $contact_other $conn_fila d0000000-0000-0000-0000-00000000000b 'oi dora 2');"
expect_value 'B2 nada foi gravado por DORA' '0' "SELECT count(*) FROM public.messages"

expect_value 'B3 CARLA (membro da fila) enviando pela conexao da fila -- permitido' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enq $contact_fila $conn_fila d0000000-0000-0000-0000-00000000000c 'oi carla')) q;"

expect_value 'B4 ADM (admin/supervisor) escolhe a conexao da fila -- permitido' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ADM',false); SELECT count(*) FROM ($(enq $contact_fila $conn_fila d0000000-0000-0000-0000-00000000000d 'oi adm')) q;"

expect_value 'B5 DORA usa a conexao SEM vinculo de fila -- permitido (inerte por construcao)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); SELECT count(*) FROM ($(enq $contact_free $conn_free d0000000-0000-0000-0000-00000000000e 'oi free')) q;"

expect_value 'B6 DORA envia SEM informar conexao e o contato esta na conexao da fila -- permitido pela atribuicao do contato' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); SELECT count(*) FROM ($(enq $contact_fila '' d0000000-0000-0000-0000-00000000000f 'oi atribuida')) q;"

expect_error 'B7 a guarda de permissao do L9 continua valendo (quem nao tem send_messages e recusado)' \
  'send_messages_permission_required' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$NO_PERM',false); $(enq $contact_free $conn_free d0000000-0000-0000-0000-000000000010 'oi sem permissao');"

expect_value 'B8 total de mensagens gravadas: 4 permitidas, 0 das recusadas' '4' \
  "SELECT count(*) FROM public.messages"

echo
echo '-- BLOCO C0: ANTES da migration de grupo (o defeito) -------------------------------'

psql_file "$tmp_dir/seed.sql"

# Defeito: nao existe RPC de enfileiramento para grupo.
expect_error 'C0.1 grupo nao tem caminho de enfileiramento (funcao ausente)' \
  'does not exist' \
  "$(enqg_group_missing)"

# Defeito: a fila so resolve destino por JOIN contacts, entao uma mensagem sem contato
# (o unico jeito de representar grupo no esquema antigo) fica presa: claim devolve 0.
psql_sql "INSERT INTO public.messages (contact_id, client_message_id, whatsapp_connection_id, agent_id, sender, status, content, message_type) VALUES (NULL, 'c0000000-0000-0000-0000-0000000000f1'::uuid, '$conn_fila'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 'agent', 'sending', 'grupo sem contato', 'text');" >/dev/null
expect_value 'C0.2 mensagem sem contato (grupo) nao e claimavel pela fila antiga' '0' \
  "SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role; SELECT count(*) FROM public.claim_outbound_message((SELECT id FROM public.messages WHERE client_message_id='c0000000-0000-0000-0000-0000000000f1'), 'aa000000-0000-0000-0000-000000000001'::uuid, 'worker-1', 90);"

echo
echo '-- Aplicando a migration de grupo ---------------------------------------------------'
psql_file "$group_migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '-- BLOCO C: DEPOIS da migration de grupo -------------------------------------------'

# C1 visibilidade do grupo: DORA tem send_messages, mas nao e membro da fila da conexao do grupo.
expect_error 'C1a DORA fora da fila nao enfileira em g_fila sem conexao explicita (sem oraculo)' \
  'message_group_not_authorized' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); $(enqg $g_fila '' e0000000-0000-0000-0000-0000000000a1 'oi dora grupo null');"
expect_error 'C1b DORA fora da fila nao enfileira em g_fila nem escolhendo a propria conexao da fila' \
  'message_group_not_authorized' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); $(enqg $g_fila $conn_fila e0000000-0000-0000-0000-0000000000a2 'oi dora grupo conn');"
expect_value 'C1c as recusas de visibilidade de grupo nao gravaram mensagens' '0' \
  "SELECT count(*) FROM public.messages WHERE client_message_id IN ('e0000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-0000000000a2')"

# C2 enfileira no grupo (CARLA e membro da fila; g_fila esta na conexao da fila).
expect_value 'C2 CARLA enfileira mensagem para o grupo -- permitido, 1 linha' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enqg $g_fila $conn_fila e0000000-0000-0000-0000-0000000000c1 'oi grupo')) q;"

expect_value 'C2b ADM (admin/supervisor) enfileira no grupo da fila -- permitido' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ADM',false); SELECT count(*) FROM ($(enqg $g_fila '' e0000000-0000-0000-0000-0000000000a3 'oi adm grupo')) q;"

expect_value 'C2c a linha de CARLA e de grupo (contact_id NULL, whatsapp_group_id setado, conexao resolvida)' '1' \
  "SELECT count(*) FROM public.messages WHERE client_message_id = 'e0000000-0000-0000-0000-0000000000c1' AND contact_id IS NULL AND whatsapp_group_id = '$g_fila' AND whatsapp_connection_id = '$conn_fila' AND agent_id = 'aa000000-0000-0000-0000-000000000001' AND sender = 'agent' AND status = 'sending'"

# C3 idempotencia: mesma chave nao duplica.
expect_value 'C3 mesma chave (mesmo payload) nao duplica' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enqg $g_fila $conn_fila e0000000-0000-0000-0000-0000000000c1 'oi grupo')) q;"
expect_value 'C3b continua 1 linha para a chave' '1' \
  "SELECT count(*) FROM public.messages WHERE client_message_id = 'e0000000-0000-0000-0000-0000000000c1'"

# C4 mesma chave com payload diferente e recusada.
expect_error 'C4 mesma chave com conteudo diferente e recusada (23505)' \
  'client_message_id_reused_with_different_payload' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); $(enqg $g_fila $conn_fila e0000000-0000-0000-0000-0000000000c1 'conteudo trocado');"

# C5 claim resolve o destino como o JID do grupo, na conexao da fila.
expect_value 'C5 claim entrega o JID do grupo como destino (contact_phone)' '1' \
  "SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role; SELECT count(*) FROM public.claim_outbound_message((SELECT id FROM public.messages WHERE client_message_id='e0000000-0000-0000-0000-0000000000c1'), 'aa000000-0000-0000-0000-000000000001'::uuid, 'worker-1', 90) WHERE contact_phone = '120363000000000000@g.us' AND whatsapp_instance_name = 'inst-q' AND contact_id IS NULL;"

# C6 complete funciona igual na mensagem de grupo (destino nao importa para o fechamento).
expect_value 'C6 complete fecha a mensagem de grupo (status sent + external_id)' 'sent' \
  "SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role; SELECT status FROM public.complete_outbound_message((SELECT id FROM public.messages WHERE client_message_id='e0000000-0000-0000-0000-0000000000c1'), (SELECT delivery_claim_token FROM public.messages WHERE client_message_id='e0000000-0000-0000-0000-0000000000c1'), 'ext-grupo-1');"

# C7 mensagem ja enviada nao e reclamada de novo.
expect_value 'C7 apos complete a mensagem nao e mais claimavel' '0' \
  "SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role; SELECT count(*) FROM public.claim_outbound_message((SELECT id FROM public.messages WHERE client_message_id='e0000000-0000-0000-0000-0000000000c1'), 'aa000000-0000-0000-0000-000000000001'::uuid, 'worker-1', 90);"

# C8 entrada invalida (imagem sem media_url) e recusada antes de gravar.
expect_error 'C8 imagem sem media_url e recusada (22023)' 'invalid_outbound_message' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT public.enqueue_group_outbound_message('$g_fila'::uuid,'e0000000-0000-0000-0000-0000000000c8'::uuid,'legenda','image',NULL,NULL,'$conn_fila'::uuid);"

# C9 guarda de permissao (L9) tambem vale para grupo.
expect_error 'C9 quem nao tem send_messages e recusado (grupo)' 'send_messages_permission_required' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$NO_PERM',false); $(enqg $g_free $conn_free e0000000-0000-0000-0000-0000000000c9 'sem permissao');"

# C10 anon nao tem EXECUTE.
expect_error 'C10 anon nao tem EXECUTE na RPC de grupo' 'permission denied' \
  "SET ROLE anon; SELECT public.enqueue_group_outbound_message('$g_fila'::uuid,'e0000000-0000-0000-0000-0000000000ca'::uuid,'oi','text',NULL,NULL,NULL);"
# C11 service_role nao tem EXECUTE (revogado).
expect_error 'C11 service_role nao tem EXECUTE na RPC de grupo' 'permission denied' \
  "SET ROLE service_role; SELECT public.enqueue_group_outbound_message('$g_fila'::uuid,'e0000000-0000-0000-0000-0000000000cb'::uuid,'oi','text',NULL,NULL,NULL);"

# C12 grupo inexistente e grupo sem acesso tem a MESMA resposta, sem gravar.
expect_error 'C12 grupo inexistente e recusado (42501)' 'message_group_not_authorized' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT public.enqueue_group_outbound_message('a0000000-0000-0000-0000-0000000000ff'::uuid,'e0000000-0000-0000-0000-0000000000cc'::uuid,'oi','text',NULL,NULL,NULL);"
expect_value 'C12b a recusa nao gravou nada' '0' \
  "SELECT count(*) FROM public.messages WHERE client_message_id = 'e0000000-0000-0000-0000-0000000000cc'"

# C13 JID invalido e recusado cedo (nao fica preso na fila).
expect_error 'C13 grupo com JID invalido e recusado (22023)' 'message_group_not_deliverable' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); $(enqg $g_bad $conn_free e0000000-0000-0000-0000-0000000000cd 'oi bad');"

# C14 escopo de conexao tambem vale para grupo: DORA (fora da fila) escolhendo a conexao da fila num grupo de outra conexao.
expect_error 'C14 DORA (fora da fila) escolhe a conexao da fila para um grupo de outra conexao -- recusada' \
  'whatsapp_connection_out_of_scope' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); $(enqg $g_free $conn_fila e0000000-0000-0000-0000-0000000000ce 'oi dora grupo');"
expect_value 'C15 CARLA (membro da fila) faz o mesmo -- permitido' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enqg $g_free $conn_fila e0000000-0000-0000-0000-0000000000cf 'oi carla grupo')) q;"

expect_value 'C16 DORA envia para grupo de conexao sem fila -- permitido' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$DORA',false); SELECT count(*) FROM ($(enqg $g_free '' e0000000-0000-0000-0000-0000000000d2 'oi dora free')) q;"

# C17 grupo sem conexao cai no fallback da conexao escolhida.
expect_value 'C17 grupo sem conexao usa a conexao escolhida (fallback)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enqg $g_sem $conn_free e0000000-0000-0000-0000-0000000000d0 'oi sem conn')) q;"

# C18 regressao: o caminho de CONTATO segue identico (claim devolve o telefone em digitos).
expect_value 'C18 regressao: contato enfileira e claim devolve o telefone' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enq $contact_fila $conn_fila e0000000-0000-0000-0000-0000000000d1 'oi contato')) q;"
expect_value 'C18b claim do contato devolve o telefone normalizado' '1' \
  "SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role; SELECT count(*) FROM public.claim_outbound_message((SELECT id FROM public.messages WHERE client_message_id='e0000000-0000-0000-0000-0000000000d1'), 'aa000000-0000-0000-0000-000000000001'::uuid, 'worker-1', 90) WHERE contact_phone = '5511911111111' AND contact_id = '$contact_fila';"

echo
echo '-- BLOCO D: invariantes de estrutura -----------------------------------------------'

expect_value 'D1 whatsapp_group_id e FK para whatsapp_groups' '1' \
  "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey) WHERE c.contype = 'f' AND t.relname = 'messages' AND a.attname = 'whatsapp_group_id' AND confrelid = 'public.whatsapp_groups'::regclass"
expect_value 'D2 indice unico parcial de idempotencia de grupo existe' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'messages' AND indexname = 'messages_group_client_msg_uq'"
expect_value 'D3 RPC de grupo e SECURITY DEFINER com search_path fixo' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname = 'enqueue_group_outbound_message' AND prosecdef AND array_to_string(proconfig,',') LIKE '%search_path%'"
expect_value 'D4 RPC de grupo so tem EXECUTE para authenticated' '1' \
  "SELECT count(*) FROM pg_proc p WHERE p.proname = 'enqueue_group_outbound_message' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')"
expect_value 'D5 RPC de grupo fixa search_path em pg_catalog,public' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname = 'enqueue_group_outbound_message' AND proconfig @> ARRAY['search_path=pg_catalog, public']"
expect_value 'D6 CHECK impede mensagem com contact_id e whatsapp_group_id ao mesmo tempo' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.messages'::regclass AND conname = 'messages_single_outbound_destination_chk' AND convalidated"
expect_error 'D7 CHECK recusa destino duplo na mesma mensagem' \
  'messages_single_outbound_destination_chk' \
  "INSERT INTO public.messages (contact_id, whatsapp_group_id, client_message_id, agent_id, sender, status, content, message_type) VALUES ('$contact_fila'::uuid, '$g_fila'::uuid, 'e0000000-0000-0000-0000-0000000000d7'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 'agent', 'sending', 'destino duplo', 'text');"

printf '\n[OK] contrato de escopo de conexao no enfileiramento verificado\n'
printf '[OK] enfileiramento e delivery de grupo (whatsapp_group_id) verificado\n'

echo
echo '-- BLOCO E: o rollback da propria migration roda e desfaz tudo ---------------------'

# Extrai os statements do cabecalho -- Rollback: da migration e aplica (rollback real, nao prosa).
sed -n '1,9p' "$group_migration" | sed -n 's/^--   //p' > "$tmp_dir/rollback.sql"
psql_file "$tmp_dir/rollback.sql"

expect_value 'E1 a coluna whatsapp_group_id foi removida' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='whatsapp_group_id'"
expect_value 'E2 a RPC de grupo foi removida' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname='enqueue_group_outbound_message'"
expect_value 'E3 os indices de grupo foram removidos' '0' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='messages' AND indexname IN ('messages_group_client_msg_uq','messages_whatsapp_group_id_idx')"
expect_value 'E3b o CHECK de destino unico foi removido' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.messages'::regclass AND conname = 'messages_single_outbound_destination_chk'"
expect_value 'E4 claim volta ao corpo so-de-contato (sem whatsapp_group_id)' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='claim_outbound_message' AND pg_get_functiondef(oid) NOT LIKE '%whatsapp_group_id%'"

printf '\n[OK] rollback da migration de grupo executado e verificado\n'
