#!/usr/bin/env bash
# Contrato de autorizacao do envio: a permissao send_messages imposta no banco (L9 da
# matriz docs/ia/IA-004-matriz-autorizacao.md).
#
# Causa raiz: a permissao so era checada no cliente (hasPermission compara um array em
# memoria) e o RPC server-side existia sem ser chamado; NENHUMA policy nem guarda do banco
# lia user_has_permission. Esconder o botao nao bloqueava a acao.
#
# BLOCO A (antes): um authenticated SEM send_messages enfileira mensagem pela RPC (defeito).
# BLOCO B (depois): o mesmo chamador recebe 42501 send_messages_permission_required e nada
#   e gravado; quem TEM a permissao continua enviando; a guarda antiga (sessao
#   authenticated) e a ACL continuam valendo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930190000_enforce_send_messages_permission_on_enqueue.sql"
sender_origin_migration="$(ls "$repo_root"/supabase/migrations/*_messages_insert_update_sender_origin.sql 2>/dev/null | head -1)"
postgres_image="${SEND_MESSAGES_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-send-msg-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-send-msg-test-[0-9]+$ ]]; then
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

-- Maquinaria de permissao, igual a producao (user_has_permission casa user_roles.user_id,
-- que guarda o id de auth.users -- NAO profiles.id).
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text, category text
);
CREATE TABLE public.role_permissions (
  role text NOT NULL, permission_id uuid NOT NULL REFERENCES public.permissions(id),
  PRIMARY KEY (role, permission_id)
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role)
);
CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = _user_id AND p.name = _permission_name) $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, status text NOT NULL, instance_id text, updated_at timestamptz NOT NULL DEFAULT now()
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

-- Corpo ATUAL de producao da RPC (sem a guarda de permissao) -- o defeito.
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
DELETE FROM public.contacts;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;
DELETE FROM public.user_roles;
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

INSERT INTO public.permissions (id, name) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'send_messages'),
  ('f0000000-0000-0000-0000-000000000002', 'view_inbox');
-- o papel 'agent' TEM send_messages; ALICE nao tem papel nenhum.
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', 'f0000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('22222222-2222-2222-2222-222222222222', 'agent');
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true);
INSERT INTO public.whatsapp_connections (id, status, instance_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'connected', 'inst-1');
INSERT INTO public.contacts (id, whatsapp_connection_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BOB='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
ENQ_ALICE="SELECT public.enqueue_outbound_message('c0000000-0000-0000-0000-000000000001'::uuid,'d0000000-0000-0000-0000-00000000000a'::uuid,'oi do alice')"
ENQ_BOB="SELECT public.enqueue_outbound_message('c0000000-0000-0000-0000-000000000001'::uuid,'d0000000-0000-0000-0000-00000000000b'::uuid,'oi do bob')"

echo '-- BLOCO A: ANTES da migration (o defeito) ------------------------------------------'

expect_value 'A1 ALICE, authenticated SEM send_messages, enfileira a mensagem (defeito)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM ($ENQ_ALICE) q;"
expect_value 'A2 a mensagem ficou gravada com sender agent' '1' \
  "SELECT count(*) FROM public.messages WHERE sender = 'agent' AND content = 'oi do alice'"
expect_value 'A3 ALICE realmente nao tem a permissao (user_has_permission=false)' 'f' \
  "SELECT public.user_has_permission('11111111-1111-1111-1111-111111111111','send_messages')"

echo
echo '-- Aplicando a migration ------------------------------------------------------------'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'

expect_error 'B1 ALICE (sem send_messages) e recusada com 42501 send_messages_permission_required' \
  'send_messages_permission_required' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); $ENQ_ALICE;"
expect_value 'B2 nada foi gravado por ALICE' '0' \
  "SELECT count(*) FROM public.messages"
expect_value 'B3 BOB (agent, com send_messages) segue enfileirando' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$BOB',false); SELECT count(*) FROM ($ENQ_BOB) q;"
expect_value 'B4 a mensagem do BOB e do profile do BOB (agent_id correto)' '1' \
  "SELECT count(*) FROM public.messages WHERE agent_id = 'b0000000-0000-0000-0000-000000000001' AND content = 'oi do bob'"
expect_error 'B5 authenticated sem claims e recusado com authentication_required' \
  'authentication_required' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','',false); $ENQ_ALICE;"
expect_value 'B6 service_role nao tem EXECUTE (ACL preservada)' 'f' \
  "SELECT has_function_privilege('service_role','public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)','EXECUTE')"
expect_value 'B7 authenticated tem EXECUTE (ACL preservada)' 't' \
  "SELECT has_function_privilege('authenticated','public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)','EXECUTE')"

# ---------------------------------------------------------------------------
# SEC-RLS_CONTATOS_MENSAGENS-01 (docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md):
# a ORIGEM da mensagem (sender) passa a ser decidida pelo banco.
# O estado ANTERIOR e montado com os arquivos REAIS que criaram as policies de
# `messages` (20260329175910 -> SELECT/UPDATE, 20260902023200 -> SELECT
# consolidada, 20260925120000 -> INSERT, 20260925223000 -> USING final do
# UPDATE); a correcao vem do arquivo REAL da migration nova. Vermelho antes e
# verde depois saem do mesmo container, com papel real (authenticated,
# service_role e a ACL de anon).
# ---------------------------------------------------------------------------
echo
echo '-- SEC-RLS_CONTATOS_MENSAGENS-01: origem da mensagem (sender) -----------------------'
[[ -n "$sender_origin_migration" && -f "$sender_origin_migration" ]] \
  || fail 'migration da origem da mensagem (messages.*sender_origin) nao encontrada'

cat > "$tmp_dir/sec01-scaffold.sql" <<'SQL'
-- Colunas, tabelas e helpers que as migrations REAIS de `messages` referenciam.
-- Unico helper transcrito a mao: is_privileged_contact_caller (mesmo corpo de
-- 20260930090000; a migration que o cria arrasta outras RPCs de contato).
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS queue_id uuid REFERENCES public.queues(id);
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
  AS $$ SELECT profile.id FROM public.profiles AS profile
        WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles
                       WHERE user_id = _user_id AND role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.is_privileged_contact_caller() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
  AS $$ SELECT coalesce(auth.role(), session_user) = ANY (ARRAY['service_role','postgres','supabase_admin']) $$;
REVOKE ALL ON FUNCTION public.is_privileged_contact_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_privileged_contact_caller() TO authenticated, service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
-- ACL de producao de `messages`: authenticated escreve; anon nao tem grant nenhum.
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated, service_role;
GRANT SELECT ON public.contacts, public.queue_members, public.profiles TO authenticated;
SQL
psql_file "$tmp_dir/sec01-scaffold.sql"

for policies_state in \
  20260329175910_f55d2541-447c-40cb-b18c-1e03a02eeced.sql \
  20260902023200_consolidate_rls_select_messages_contacts.sql \
  20260925120000_fix_messages_insert_rls_contact_visibility.sql \
  20260925223000_messages_update_policy_queue_parity.sql; do
  psql_file "$repo_root/supabase/migrations/$policies_state"
done

cat > "$tmp_dir/sec01-seed.sql" <<'SQL'
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111','admin')
  ON CONFLICT DO NOTHING;
DELETE FROM public.messages WHERE id IN
  ('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002');
INSERT INTO public.contacts (id, whatsapp_connection_id, assigned_to) VALUES
  ('a1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO UPDATE
    SET assigned_to = EXCLUDED.assigned_to,
        whatsapp_connection_id = EXCLUDED.whatsapp_connection_id;
INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, agent_id) VALUES
  ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','contact','entrada do cliente','text',false,NULL),
  ('a2000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','agent','resposta do agente','text',false,'b0000000-0000-0000-0000-000000000001');
SQL
psql_file "$tmp_dir/sec01-seed.sql"

sc01_visivel='a1000000-0000-0000-0000-000000000001'
sc01_invisivel='a1000000-0000-0000-0000-000000000002'
sc01_entrada='a2000000-0000-0000-0000-000000000001'
sc01_propria='a2000000-0000-0000-0000-000000000002'
sc01_perfil_bob='b0000000-0000-0000-0000-000000000001'
sec01_bob_claims='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
sec01_alice_claims='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
sec01_bob() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$sec01_bob_claims" "$1"; }
sec01_alice() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$sec01_alice_claims" "$1"; }
sec01_service() { printf "SET ROLE service_role; SELECT set_config('request.jwt.claims', '%s', false); %s" '{"role":"service_role"}' "$1"; }

echo
echo '-- ANTES da migration: o defeito, com os arquivos REAIS das policies ---------------'
expect_value 'R1 agente insere mensagem de cliente (sender=contact aceito: defeito)' '1' \
  "$(sec01_bob "INSERT INTO public.messages (contact_id, sender, content, message_type) VALUES ('$sc01_visivel','contact','forjada antes da migration','text'); SELECT count(*) FROM public.messages WHERE content='forjada antes da migration';")"
expect_value 'R2 agente converte mensagem de ENTRADA em resposta do atendente (defeito)' '1' \
  "$(sec01_bob "UPDATE public.messages SET sender='agent', status='sent' WHERE id='$sc01_entrada'; SELECT count(*) FROM public.messages WHERE id='$sc01_entrada' AND sender='agent';")"

echo
echo '-- Aplicando a migration da origem da mensagem ------------------------------------'
psql_file "$sender_origin_migration"
psql_sql "DELETE FROM public.messages WHERE content = 'forjada antes da migration'" >/dev/null
psql_file "$tmp_dir/sec01-seed.sql"

echo
echo '-- DEPOIS da migration ------------------------------------------------------------'
expect_error 'G1 INSERT com sender=contact e recusado (a mensagem de entrada e do canal)' \
  'new row violates row-level security policy' \
  "$(sec01_bob "INSERT INTO public.messages (contact_id, sender, content, message_type) VALUES ('$sc01_visivel','contact','forjada depois da migration','text');")"
expect_value 'G2 nada foi gravado na tentativa de forja' '0' \
  "SELECT count(*) FROM public.messages WHERE content = 'forjada depois da migration'"
expect_value 'G3 INSERT com sender=agent no contato proprio segue valendo' '1' \
  "$(sec01_bob "INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id) VALUES ('$sc01_visivel','agent','envio legitimo','text','$sc01_perfil_bob'); SELECT count(*) FROM public.messages WHERE content='envio legitimo';")"
expect_value 'G4 UPDATE da mensagem propria (is_read) segue valendo' '1' \
  "$(sec01_bob "UPDATE public.messages SET is_read=true WHERE id='$sc01_propria'; SELECT count(*) FROM public.messages WHERE id='$sc01_propria' AND is_read")"
expect_value 'G5 marcar como LIDA a mensagem de ENTRADA segue valendo (fluxo do inbox)' '1' \
  "$(sec01_bob "UPDATE public.messages SET is_read=true WHERE id='$sc01_entrada'; SELECT count(*) FROM public.messages WHERE id='$sc01_entrada' AND is_read")"
expect_error 'G6 converter a mensagem de ENTRADA em resposta do atendente e recusado' \
  'new row violates row-level security policy' \
  "$(sec01_bob "UPDATE public.messages SET sender='agent', status='sent' WHERE id='$sc01_entrada';")"
expect_error 'G7 converter a mensagem PROPRIA em mensagem de cliente e recusado' \
  'new row violates row-level security policy' \
  "$(sec01_bob "UPDATE public.messages SET sender='contact' WHERE id='$sc01_propria';")"
expect_error 'G8 mover a mensagem para contato fora da carteira e recusado (visibilidade no WITH CHECK)' \
  'new row violates row-level security policy' \
  "$(sec01_bob "UPDATE public.messages SET contact_id='$sc01_invisivel' WHERE id='$sc01_propria';")"
expect_error 'G9 INSERT sender=agent em contato de OUTRO agente e recusado (visibilidade preservada)' \
  'new row violates row-level security policy' \
  "$(sec01_bob "INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id) VALUES ('$sc01_invisivel','agent','envio em carteira alheia','text','$sc01_perfil_bob');")"
expect_error 'G10 admin tambem nao forja mensagem de cliente (sender=contact)' \
  'new row violates row-level security policy' \
  "$(sec01_alice "INSERT INTO public.messages (contact_id, sender, content, message_type) VALUES ('$sc01_invisivel','contact','forja do admin','text');")"
expect_value 'G11 admin segue inserindo sender=agent em contato de outro agente (preservado)' '1' \
  "$(sec01_alice "INSERT INTO public.messages (contact_id, sender, content, message_type) VALUES ('$sc01_invisivel','agent','envio do admin','text'); SELECT count(*) FROM public.messages WHERE content='envio do admin';")"
expect_value 'G12 service_role segue ingerindo inbound (sender=contact)' '1' \
  "$(sec01_service "INSERT INTO public.messages (contact_id, sender, content, message_type) VALUES ('$sc01_visivel','contact','inbound do webhook','text'); SELECT count(*) FROM public.messages WHERE content='inbound do webhook';")"
expect_value 'G13 anon nao tem INSERT em messages (ACL de producao)' 'f' \
  "SELECT has_table_privilege('anon','public.messages','INSERT')"

printf '\n[OK] contrato de autorizacao do send_messages na RPC de enfileiramento verificado\n'
printf '[OK] origem da mensagem fixada pelo banco (SEC-RLS_CONTATOS_MENSAGENS-01): forja de inbound e conversao de origem recusadas; inbox, admin e service_role preservados\n'
