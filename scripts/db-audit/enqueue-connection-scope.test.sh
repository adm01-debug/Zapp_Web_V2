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
postgres_image="${ENQUEUE_SCOPE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
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
CREATE TABLE public.contacts (id uuid PRIMARY KEY, whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id));
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  client_message_id uuid, whatsapp_connection_id uuid, agent_id uuid,
  sender text, content text, message_type text, media_url text, caption text,
  reply_to_id uuid, is_read boolean, status text, external_id text, status_updated_at timestamptz
);
CREATE UNIQUE INDEX messages_contact_client_msg_uq
  ON public.messages (contact_id, client_message_id) WHERE client_message_id IS NOT NULL;

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
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.messages;
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
INSERT INTO public.contacts (id, whatsapp_connection_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002');
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

enq() { # $1=contact $2=connection $3=cid $4=texto  (sem ponto-e-virgula; conexao vazia -> NULL)
  local conn="NULL"
  [ -n "$2" ] && conn="'$2'::uuid"
  printf "SELECT public.enqueue_outbound_message('%s'::uuid,'%s'::uuid,'%s','text',NULL,NULL,%s)" "$1" "$3" "$4" "$conn"
}

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

printf '\n[OK] contrato de escopo de conexao no enfileiramento verificado\n'
