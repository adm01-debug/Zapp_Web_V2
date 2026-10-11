#!/usr/bin/env bash
# Contrato de autorizacao da EDICAO de mensagem (RPC public.edit_message).
#
# Causa raiz: o cliente editava mensagem com UPDATE direto em public.messages. A
# policy de UPDATE e por CONTATO (visibilidade), nao por remetente: qualquer
# agente que ve o contato reescrevia o conteudo de uma mensagem RECEBIDA ou ja
# enviada, e ainda podia trocar sender / external_id / created_at.
#
# BLOCO A (antes da migration): o UPDATE direto de content por authenticated
#   reescreve uma mensagem RECEBIDA na janela (o defeito).
# BLOCO B (depois): o UPDATE direto de content e recusado (42501
#   message_content_edit_requires_rpc) mesmo com a marca de sessao forjada; a RPC
#   edit_message edita a propria mensagem enviada e recusa recebida, sem
#   permissao, fora da janela, apagada, sem external_id e contato invisivel;
#   sender/external_id continuam imutaveis para o cliente; soft delete,
#   is_read e transcription continuam; service_role segue escrevendo; ACL fecha
#   anon e a guarda. O teste roda em Postgres real descartavel: o BLOCO A
#   recebe o schema minimo do contrato afetado e o BLOCO B executa a migration do cartao por cima.
#
# Prova de papel real: tudo roda sob SET ROLE (authenticated / service_role),
# com claims sinteticas, nunca como postgres.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011151650_edit_message_rpc.sql"
postgres_image="${EDIT_MESSAGE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-edit-message-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-edit-message-test-[0-9]+$ ]]; then
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

-- Maquinaria de permissao, igual a producao.
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

-- Visibilidade de contato por usuario (substitui o retorno-constante do fixture
-- minimo: aqui um contato pode ser INVISIVEL para provar a guarda da RPC).
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  assigned_to uuid
);
CREATE TABLE public._visibilidade (user_id uuid NOT NULL, contact_id uuid NOT NULL, PRIMARY KEY (user_id, contact_id));
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public._visibilidade v
       WHERE v.contact_id = _contact_id AND v.user_id = _user_id) $$;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  whatsapp_connection_id uuid, agent_id uuid,
  sender text NOT NULL CHECK (sender IN ('agent', 'contact')),
  content text NOT NULL, message_type text NOT NULL DEFAULT 'text',
  media_url text, caption text, is_read boolean DEFAULT false,
  is_deleted boolean DEFAULT false, is_edited boolean NOT NULL DEFAULT false,
  external_id text, transcription text, transcription_status text,
  status text, status_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Gatilho padrao de updated_at, igual a producao.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, action text NOT NULL, entity_type text, entity_id uuid,
  details jsonb DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS de producao: leitura e escrita por CONTATO (visibilidade), nunca por
-- remetente -- e exatamente por isso o UPDATE direto de content era o furo.
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_select_vis ON public.messages FOR SELECT TO authenticated
  USING (public.is_contact_visible_to_user(contact_id, auth.uid()));
CREATE POLICY messages_update_vis ON public.messages FOR UPDATE TO authenticated
  USING (public.is_contact_visible_to_user(contact_id, auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, UPDATE ON public.messages TO service_role;
GRANT SELECT ON public.contacts, public.whatsapp_connections, public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.audit_logs;
DELETE FROM public.messages;
DELETE FROM public._visibilidade;
DELETE FROM public.contacts;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;
DELETE FROM public.user_roles;
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

INSERT INTO public.permissions (id, name) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'send_messages');
-- 'agent' tem send_messages; CAROL nao tem papel nenhum.
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', 'f0000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'agent');

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true);

INSERT INTO public.whatsapp_connections (id, status, instance_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'connected', 'inst-1');

INSERT INTO public.contacts (id, whatsapp_connection_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001');

-- ALICE ve o contato c1; CAROL tambem (para isolar a recusa por permissao);
-- ninguem ve o c2.
INSERT INTO public._visibilidade (user_id, contact_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.messages
  (id, contact_id, agent_id, sender, content, message_type, external_id, is_deleted, created_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', NULL,
   'contact', 'oi, preciso de ajuda', 'text', 'wamid-rec', false, now()),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'agent', 'ja volto', 'text', 'wamid-sent', false, now()),
  ('10000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'agent', 'antiga', 'text', 'wamid-old', false, now() - interval '30 minutes'),
  ('10000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'agent', 'ainda enviando', 'text', NULL, false, now()),
  ('10000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'agent', 'apagada com conteudo preservado', 'text', 'wamid-del', true, now()),
  ('10000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000001', 'agent', 'de outro contato', 'text', 'wamid-hidden', false, now());
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
CAROL='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'

as_alice() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims','%s',false); %s;" "$ALICE" "$1"; }
as_carol() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims','%s',false); %s;" "$CAROL" "$1"; }

echo '-- BLOCO A: ANTES da migration (o defeito) ------------------------------------------'

expect_value 'A1 ALICE, authenticated, reescreve o conteudo de uma mensagem RECEBIDA (defeito)' '1' \
  "$(as_alice "UPDATE public.messages SET content = 'HACKEADO' WHERE id = '10000000-0000-0000-0000-000000000001'; SELECT count(*) FROM public.messages WHERE content = 'HACKEADO'")"
expect_value 'A2 ALICE tambem reescreve sender pela via direta (defeito)' '1' \
  "$(as_alice "UPDATE public.messages SET sender = 'agent' WHERE id = '10000000-0000-0000-0000-000000000001'; SELECT count(*) FROM public.messages WHERE sender = 'agent' AND id = '10000000-0000-0000-0000-000000000001'")"
expect_value 'A3 a RPC edit_message ainda nao existe (defeito)' 'f' \
  "SELECT to_regprocedure('public.edit_message(uuid,text)') IS NOT NULL"

echo
echo '-- Aplicando a migration ------------------------------------------------------------'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '-- BLOCO B: DEPOIS da migration -----------------------------------------------------'

M_RECV='10000000-0000-0000-0000-000000000001'
M_SENT='10000000-0000-0000-0000-000000000002'
M_OLD='10000000-0000-0000-0000-000000000003'
M_SENDING='10000000-0000-0000-0000-000000000004'
M_DELETED='10000000-0000-0000-0000-000000000005'
M_HIDDEN='10000000-0000-0000-0000-000000000006'

expect_error 'B1 UPDATE direto de content da mensagem RECEBIDA e recusado (message_content_edit_requires_rpc)' \
  'message_content_edit_requires_rpc' \
  "$(as_alice "UPDATE public.messages SET content = 'HACKEADO' WHERE id = '$M_RECV'")"
expect_error 'B2 UPDATE direto de content da propria mensagem enviada tambem e recusado' \
  'message_content_edit_requires_rpc' \
  "$(as_alice "UPDATE public.messages SET content = 'HACKEADO' WHERE id = '$M_SENT'")"
expect_error 'B3 authenticated NAO forja a marca de sessao para passar a guarda' \
  'message_content_edit_requires_rpc' \
  "$(as_alice "SELECT set_config('app.edit_message_rpc','on',false); UPDATE public.messages SET content = 'HACKEADO' WHERE id = '$M_RECV'")"
expect_error 'B4 UPDATE direto de sender e recusado (message_immutable_columns_forbidden)' \
  'message_immutable_columns_forbidden' \
  "$(as_alice "UPDATE public.messages SET sender = 'agent' WHERE id = '$M_RECV'")"
expect_error 'B5 UPDATE direto de external_id e recusado (message_immutable_columns_forbidden)' \
  'message_immutable_columns_forbidden' \
  "$(as_alice "UPDATE public.messages SET external_id = 'wamid-fake' WHERE id = '$M_SENT'")"
expect_error 'B6 UPDATE direto de created_at e recusado (message_immutable_columns_forbidden)' \
  'message_immutable_columns_forbidden' \
  "$(as_alice "UPDATE public.messages SET created_at = now() WHERE id = '$M_SENT'")"

expect_value 'B7 a RPC edita a propria mensagem enviada e devolve o novo conteudo' 'novo texto' \
  "$(as_alice "SELECT (public.edit_message('$M_SENT'::uuid, '  novo texto  ')).content")"
expect_value 'B8 a edicao marca is_edited=true' 't' \
  "SELECT is_edited FROM public.messages WHERE id = '$M_SENT'"
expect_value 'B9 a edicao gravou UM evento de auditoria sem o texto da mensagem' 't' \
  "SELECT count(*) = 1 AND bool_and(action = 'message_edited' AND entity_id = '$M_SENT'::uuid AND NOT (details ? 'content')) FROM public.audit_logs"

expect_error 'B10 a RPC recusa editar mensagem RECEBIDA (message_not_editable)' \
  'message_not_editable' \
  "$(as_alice "SELECT public.edit_message('$M_RECV'::uuid, 'texto')")"
expect_error 'B11 a RPC recusa quem nao tem send_messages (send_messages_permission_required)' \
  'send_messages_permission_required' \
  "$(as_carol "SELECT public.edit_message('$M_SENT'::uuid, 'texto')")"
expect_error 'B12 a RPC recusa fora da janela de 15 min (message_edit_window_expired)' \
  'message_edit_window_expired' \
  "$(as_alice "SELECT public.edit_message('$M_OLD'::uuid, 'texto')")"
expect_error 'B13 a RPC recusa mensagem sem external_id (message_not_editable)' \
  'message_not_editable' \
  "$(as_alice "SELECT public.edit_message('$M_SENDING'::uuid, 'texto')")"
expect_error 'B14 a RPC recusa mensagem ja apagada (message_not_editable)' \
  'message_not_editable' \
  "$(as_alice "SELECT public.edit_message('$M_DELETED'::uuid, 'texto')")"
expect_error 'B15 a RPC recusa contato invisivel sem revelar existencia (message_not_found_or_not_authorized)' \
  'message_not_found_or_not_authorized' \
  "$(as_alice "SELECT public.edit_message('$M_HIDDEN'::uuid, 'texto')")"
expect_error 'B16 a RPC recusa conteudo vazio (invalid_message_edit_content)' \
  'invalid_message_edit_content' \
  "$(as_alice "SELECT public.edit_message('$M_SENT'::uuid, '   ')")"
expect_error 'B17 texto acima de 4096 e recusado (message_edit_content_too_long)' \
  'message_edit_content_too_long' \
  "$(as_alice "SELECT public.edit_message('$M_SENT'::uuid, repeat('a', 4097))")"

expect_value 'B18 soft delete continua: authenticated apaga com tombstone + is_deleted' 't' \
  "$(as_alice "UPDATE public.messages SET content = '[Mensagem apagada]', is_deleted = true WHERE id = '$M_RECV'; SELECT content = '[Mensagem apagada]' AND is_deleted FROM public.messages WHERE id = '$M_RECV'")"
expect_error 'B19 soft delete nao vira atalho para reescrever texto arbitrario' \
  'message_content_edit_requires_rpc' \
  "$(as_alice "UPDATE public.messages SET content = 'HACKEADO', is_deleted = true WHERE id = '$M_SENT'")"
expect_error 'B20 mensagem ja apagada nao troca content via update direto' \
  'message_content_edit_requires_rpc' \
  "$(as_alice "UPDATE public.messages SET content = '[Mensagem apagada]' WHERE id = '$M_DELETED'")"
expect_value 'B21 UPDATE de is_read continua permitido' 't' \
  "$(as_alice "UPDATE public.messages SET is_read = true WHERE id = '$M_RECV'; SELECT is_read FROM public.messages WHERE id = '$M_RECV'")"
expect_value 'B22 UPDATE de transcription continua permitido' 't' \
  "$(as_alice "UPDATE public.messages SET transcription = 'oi', transcription_status = 'done' WHERE id = '$M_RECV'; SELECT transcription_status = 'done' FROM public.messages WHERE id = '$M_RECV'")"

expect_value 'B23 service_role (Edge) segue escrevendo content/external_id' 't' \
  "SET ROLE service_role; UPDATE public.messages SET content = 'texto do edge', external_id = 'wamid-edge' WHERE id = '$M_SENT'; SELECT content = 'texto do edge' AND external_id = 'wamid-edge' FROM public.messages WHERE id = '$M_SENT'"

expect_value 'B24 ACL: authenticated tem EXECUTE na RPC edit_message' 't' \
  "SELECT has_function_privilege('authenticated','public.edit_message(uuid,text)','EXECUTE')"
expect_value 'B25 ACL: anon NAO tem EXECUTE na RPC edit_message' 'f' \
  "SELECT has_function_privilege('anon','public.edit_message(uuid,text)','EXECUTE')"
expect_value 'B26 ACL: a funcao de guarda nao e executavel por authenticated' 'f' \
  "SELECT has_function_privilege('authenticated','public.guard_message_immutable_columns()','EXECUTE')"
expect_value 'B27 a guarda esta armada em public.messages' 't' \
  "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_message_immutable_columns' AND tgrelid = 'public.messages'::regclass AND NOT tgisinternal)"

echo
echo '-- BLOCO C: ROLLBACK -------------------------------------------------------------'
psql_sql 'DROP TRIGGER IF EXISTS trg_guard_message_immutable_columns ON public.messages; DROP FUNCTION IF EXISTS public.guard_message_immutable_columns(); DROP FUNCTION IF EXISTS public.edit_message(uuid, text);' >/dev/null
psql_file "$tmp_dir/seed.sql"
expect_value 'C1 rollback remove a RPC edit_message' 'f' \
  "SELECT to_regprocedure('public.edit_message(uuid,text)') IS NOT NULL"
expect_value 'C2 rollback remove a guarda de trigger' 'f' \
  "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_message_immutable_columns' AND tgrelid = 'public.messages'::regclass AND NOT tgisinternal)"
expect_value 'C3 rollback restaura o comportamento anterior de UPDATE direto de content por authenticated' '1' \
  "$(as_alice "UPDATE public.messages SET content = 'HACKEADO_ROLLBACK' WHERE id = '$M_RECV'; SELECT count(*) FROM public.messages WHERE content = 'HACKEADO_ROLLBACK'")"

printf '\n[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado\n'
