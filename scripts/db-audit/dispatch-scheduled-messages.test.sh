#!/usr/bin/env bash
# Contrato do despacho de mensagens agendadas (public.dispatch_scheduled_messages).
#
# Causa raiz: public.scheduled_messages tem RLS, indice de pendentes e hook de tela,
# mas NADA envia a mensagem quando chega a hora — nenhuma Edge, nenhuma funcao SQL e
# nenhum job do pg_cron toca a tabela. Mensagem agendada nunca sai.
#
# BLOCO B (depois): a funcao pega as pendentes vencidas em lote, enfileira a mensagem
#   pelo caminho canonico (enqueue_outbound_message) COMO O DONO, e marca sent/failed.
#   Prova: so vencidas e pendentes; mensagem enfileirada com conexao e status; sent_at
#   preenchido e error_message nulo; idempotente no retry; contato legado usa o
#   fallback; midia (localizador) preservada; sem permissao do dono NAO envia;
#   remetente inativo / sem conexao / contato invisivel viram failed com motivo e
#   auditoria; lote obediente ao p_limit; falha de um item nao cancela os outros.
# BLOCO C (concorrencia): com a linha travada por outra sessao, o despacho pula o item
#   (FOR UPDATE SKIP LOCKED) e, apos liberar, enfileira uma unica vez — sem duplicar.
# BLOCO D (vacuidade): ZAPP_DISPATCH_SEM_CORRECAO=1 nao carrega a funcao e o BLOCO B
#   tem de FALHAR (prova que as assercoes nao sao vazias).
#
# O corpo real da funcao e extraido do arquivo da migration versionada (nunca copiado),
# assim como o de enqueue_outbound_message (20260930200000_enforce_enqueue_connection_scope.sql)
# e as linhas de ACL — tudo verbatim.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011133612_dispatch_scheduled_messages.sql"
arq_enqueue="$repo_root/supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql"
postgres_image="${DISPATCH_SCHEDULED_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-dispatch-scheduled-test-$$"
sem_correcao="${ZAPP_DISPATCH_SEM_CORRECAO:-0}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-dispatch-scheduled-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
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

# Extrai o CREATE FUNCTION <nome> de um arquivo versionado, verbatim.
extrair_funcao() {
  python3 - "$1" "$2" <<'PY'
import re, sys
caminho, nome = sys.argv[1], sys.argv[2]
fonte = open(caminho, encoding='utf-8').read()
padrao = re.compile(r'^CREATE (?:OR REPLACE )?FUNCTION public\.' + re.escape(nome)
                    + r'\s*\(.*?\n(?:\$function\$|\$\$);', re.S | re.M)
achado = padrao.search(fonte)
if not achado:
    sys.exit('funcao %s nao encontrada em %s' % (nome, caminho))
sys.stdout.write(achado.group(0) + '\n')
PY
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$arq_enqueue" ]] || fail "enqueue nao encontrado: $arq_enqueue"

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

# --- corpos reais (enqueue canonico + a funcao sob teste + ACL), verbatim ------------
extrair_funcao "$arq_enqueue" enqueue_outbound_message > "$tmp_dir/enqueue.sql"
if [[ "$sem_correcao" == 1 ]]; then
  : > "$tmp_dir/dispatch.sql"
else
  {
    sed -n '/^ALTER TABLE public\.scheduled_messages/,+1p' "$migration"
    extrair_funcao "$migration" dispatch_scheduled_messages
    sed -n '/^REVOKE ALL ON FUNCTION public\.dispatch_scheduled_messages/,/^ *TO service_role;/p' "$migration"
  } > "$tmp_dir/dispatch.sql"
fi

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

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT _user_id = '99999999-9999-9999-9999-999999999999'::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true, name text, job_title text);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, name text, status text NOT NULL, instance_id text, is_default boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.whatsapp_connection_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), whatsapp_connection_id uuid NOT NULL, queue_id uuid NOT NULL
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_id uuid NOT NULL, profile_id uuid NOT NULL,
  is_active boolean DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  assigned_to uuid REFERENCES public.profiles(id),
  is_active boolean DEFAULT true,
  conversation_status text NOT NULL DEFAULT 'open',
  deleted_at timestamptz
);
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
  AS $$ SELECT _contact_id <> 'c0000000-0000-0000-0000-000000000009'::uuid $$;

-- Tabela real das agendadas (colunas usadas pela funcao).
CREATE TABLE public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  media_url text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_by uuid REFERENCES public.profiles(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, action text NOT NULL, entity_type text, entity_id uuid,
  details jsonb DEFAULT '{}', ip_address text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A infraestrutura (service_role) enxerga as tabelas que o despacho escreve.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.audit_logs;
DELETE FROM public.messages;
DELETE FROM public.scheduled_messages;

INSERT INTO public.permissions (id, name) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'send_messages');
-- papel 'agent' e 'admin' TEM send_messages; BOB nao tem papel nenhum.
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', 'f0000000-0000-0000-0000-000000000001'),
  ('admin', 'f0000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'agent'),
  ('99999999-9999-9999-9999-999999999999', 'admin');
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('bb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true),
  ('cc000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', true),
  ('dd000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', false);
INSERT INTO public.whatsapp_connections (id, name, status, instance_id, updated_at) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Principal', 'connected', 'inst-1', now()),
  ('e0000000-0000-0000-0000-000000000002', 'Antiga', 'disconnected', 'inst-2', now() - interval '1 day');
INSERT INTO public.contacts (id, whatsapp_connection_id, assigned_to, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', NULL, true),
  ('c0000000-0000-0000-0000-000000000002', NULL, NULL, true),
  ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', NULL, true),
  ('c0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000001', NULL, true),
  ('c0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', NULL, true);
UPDATE public.contacts SET conversation_status = 'archived'
  WHERE id = 'c0000000-0000-0000-0000-000000000004';
UPDATE public.profiles SET name = 'Carla Souza', job_title = 'Vendedora'
  WHERE id = 'aa000000-0000-0000-0000-000000000001';
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/enqueue.sql"
psql_file "$tmp_dir/seed.sql"

# --- atalhos ------------------------------------------------------------------------
carla='aa000000-0000-0000-0000-000000000001'
bob='bb000000-0000-0000-0000-000000000001'
inativo='dd000000-0000-0000-0000-000000000001'
admin='cc000000-0000-0000-0000-000000000001'
c1='c0000000-0000-0000-0000-000000000001'
c2='c0000000-0000-0000-0000-000000000002'
c9='c0000000-0000-0000-0000-000000000009'
c4='c0000000-0000-0000-0000-000000000004'
e1='e0000000-0000-0000-0000-000000000001'
e2='e0000000-0000-0000-0000-000000000002'
CARLA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
SERVICE='"role":"service_role"'

# Despacho como a infraestrutura chama (service_role), com o claim de servico.
svc() { printf "SET ROLE service_role; SELECT set_config('request.jwt.claims','{%s}',false); %s" "$SERVICE" "$1"; }
limpar() { psql_sql "DELETE FROM public.audit_logs; DELETE FROM public.messages; DELETE FROM public.scheduled_messages;" >/dev/null; }

echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'

if [[ "$sem_correcao" == 1 ]]; then
  echo '[MUTACAO] funcao NAO carregada (ZAPP_DISPATCH_SEM_CORRECAO=1): o BLOCO B tem de FALHAR'
else
  psql_file "$tmp_dir/dispatch.sql"
fi

# B1 — so vencidas e pendentes
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000001','$c1','texto agendado','text', now() - interval '10 min','pending','$carla'),
  ('d0000000-0000-0000-0000-000000000002','$c1','futura','text', now() + interval '1 hour','pending','$carla'),
  ('d0000000-0000-0000-0000-000000000003','$c1','cancelada','text', now() - interval '10 min','cancelled','$carla'),
  ('d0000000-0000-0000-0000-000000000004','$c1','ja enviada','text', now() - interval '10 min','sent','$carla');" >/dev/null

expect_value 'B1 o lote despeja so a vencida pendente (1 linha)' '1' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"
expect_value 'B1b so a vencida pendente mudou de estado (sent|pending|cancelled|sent)' \
  'sent|pending|cancelled|sent' \
  "SELECT string_agg(status, '|' ORDER BY id) FROM public.scheduled_messages"

expect_value 'B2 a mensagem foi enfileirada pelo dono, com conexao e status sending' \
  "1|agent|sending|$e1|$carla|*Carla - Vendedora:*<NL>texto agendado" \
  "SELECT count(*)::text || '|' || min(sender) || '|' || min(status) || '|' || min(whatsapp_connection_id::text) \
        || '|' || min(agent_id::text) || '|' || replace(min(content), chr(10), '<NL>') \
   FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000001'"
expect_value 'B2b o client_message_id da mensagem e o id do agendamento' '1' \
  "SELECT count(*) FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000001'"

expect_value 'B3 sent_at e message_id preenchidos e error_message nulo na enviada' 'true|NULO' \
  "SELECT (sent_at IS NOT NULL AND message_id IS NOT NULL)::text || '|' || coalesce(error_message, 'NULO') \
   FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000001'"
expect_value 'B3b a coluna message_id da agendada e o id da mensagem criada' 'true' \
  "SELECT (message_id = (SELECT id FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000001'))::text \
   FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000001'"

# B3c — o message_id DEVOLVIDO pelo despacho e igual ao messages.id (ponto 1/3 da recusa).
# As duas consultas rodam na mesma sessao: a primeira guarda o message_id devolvido
# numa TEMP, a segunda compara com a linha criada (mesma sessao enxerga o INSERT).
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000020','$c1','confere retorno','text', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B3c o message_id devolvido e igual ao messages.id da mensagem criada' 'true' \
  "$(svc "SELECT message_id::text INTO TEMP t_ret FROM public.dispatch_scheduled_messages(); SELECT ((SELECT message_id FROM t_ret) = (SELECT id::text FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000020'))::text;")"

expect_value 'B4 reprocessar nao reenvia (0 linhas no lote)' '0' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"
expect_value 'B4b nenhuma mensagem nova foi criada (segue 1)' '1' \
  "SELECT count(*) FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000020'"

# B5 — contato legado sem conexao atribuida usa o fallback
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000005','$c2','legado','text', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B5 contato legado sem conexao: enfileira usando o fallback e devolve message_id' 'sent|true' \
  "$(svc "SELECT outcome || '|' || (message_id IS NOT NULL)::text FROM public.dispatch_scheduled_messages()")"
expect_value 'B5b o agendamento legado ficou sent' "sent" \
  "SELECT status FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000005'"
expect_value 'B5c a mensagem legada saiu pela conexao conectada' "$e1" \
  "SELECT whatsapp_connection_id::text FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000005'"

# B6 — midia: o localizador privado e preservado no enfileiramento
limpar
midia='https://exemplo.invalid/storage/v1/object/public/whatsapp-media/agendada.png'
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, media_url, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000006','$c1','legenda','image','$midia', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B6 midia: a agendada com localizador e enfileirada' '1' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"
expect_value 'B6b o localizador privado foi preservado na mensagem (image)' "image|$midia" \
  "SELECT message_type || '|' || media_url FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000006'"

# B7 — sem permissao do dono nao envia
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000007','$c1','texto do bob','text', now() - interval '5 min','pending','$bob');" >/dev/null
expect_value 'B7 dono sem send_messages: o item falha com message_id nulo no retorno' "failed|NULO" \
  "$(svc "SELECT outcome || '|' || coalesce(message_id::text, 'NULO') FROM public.dispatch_scheduled_messages()")"
expect_value 'B7b o agendamento ficou failed sem_permissao com message_id nulo' 'true' \
  "SELECT (status = 'failed' AND error_message = 'sem_permissao' AND message_id IS NULL)::text \
   FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000007'"
expect_value 'B7c nada foi enfileirado pelo dono sem permissao' '0' \
  "SELECT count(*) FROM public.messages"
expect_value 'B7d falha auditada com motivo, sem telefone nem conteudo' 'true' \
  "SELECT (action = 'scheduled_message_dispatch_failed' \
           AND entity_id = 'd0000000-0000-0000-0000-000000000007' \
           AND (details->>'reason') = 'sem_permissao' \
           AND details::text NOT LIKE '%texto do bob%')::text \
   FROM public.audit_logs WHERE entity_id = 'd0000000-0000-0000-0000-000000000007'"

# B8 — remetente inativo
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000008','$c1','inativo','text', now() - interval '5 min','pending','$inativo');" >/dev/null
expect_value 'B8 remetente inativo: failed com autor_inativo' "autor_inativo" \
  "$(svc "SELECT failure_reason FROM public.dispatch_scheduled_messages()")"
expect_value 'B8b auditado' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE entity_id = 'd0000000-0000-0000-0000-000000000008'"

# B9 — nenhuma conexao conectada
limpar
psql_sql "UPDATE public.whatsapp_connections SET status = 'disconnected' WHERE id = '$e1';
  INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000009','$c1','sem conexao','text', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B9 sem conexao conectada: failed com conexao_invalida' 'true' \
  "$(svc "SELECT (outcome = 'failed' AND failure_reason = 'conexao_invalida')::text FROM public.dispatch_scheduled_messages()")"
psql_sql "UPDATE public.whatsapp_connections SET status = 'connected' WHERE id = '$e1';" >/dev/null

# B10 — contato invisivel para o dono
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000010','$c9','invisivel','text', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B10 contato invisivel: failed com contato_invalido e message_id nulo' 'failed|contato_invalido|NULO' \
  "$(svc "SELECT outcome || '|' || failure_reason || '|' || coalesce(message_id::text, 'NULO') FROM public.dispatch_scheduled_messages()")"

# B11 — lote obedece ao p_limit
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000011','$c1','lote 1','text', now() - interval '14 min','pending','$carla'),
  ('d0000000-0000-0000-0000-000000000012','$c1','lote 2','text', now() - interval '12 min','pending','$carla'),
  ('d0000000-0000-0000-0000-000000000013','$c1','lote 3','text', now() - interval '10 min','pending','$carla');" >/dev/null
expect_value 'B11 o lote respeita o p_limit (2 de 3)' '2' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages(2)")"
expect_value 'B11a sobrou 1 pendente apos o lote de 2' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE status = 'pending'"
expect_value 'B11b em seguida o resto e despachado (1 linha)' '1' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"
expect_value 'B11c nenhuma pendente sobrou' '0' \
  "SELECT count(*) FROM public.scheduled_messages WHERE status = 'pending'"

# B12 — falha de um item nao cancela os outros
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000014','$c1','falha primeiro','text', now() - interval '12 min','pending','$bob'),
  ('d0000000-0000-0000-0000-000000000015','$c1','ok depois','text', now() - interval '10 min','pending','$carla');" >/dev/null
expect_value 'B12 os dois itens foram processados, na ordem (failed|sent)' '2|failed|sent' \
  "$(svc "WITH d AS (SELECT * FROM public.dispatch_scheduled_messages()) \
         SELECT (SELECT count(*) FROM d)::text || '|' \
                || (SELECT string_agg(outcome, '|' ORDER BY scheduled_message_id) FROM d)")"
expect_value 'B12b o 2o item saiu apesar da falha do 1o (1 enviada, 1 failed)' '1|1' \
  "SELECT (SELECT count(*) FROM public.messages)::text || '|' \
        || (SELECT count(*) FROM public.scheduled_messages WHERE status = 'failed')::text"

# B13 — nada vencido: o lote e vazio
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000016','$c1','futura','text', now() + interval '1 hour','pending','$carla'),
  ('d0000000-0000-0000-0000-000000000017','$c1','cancelada','text', now() - interval '10 min','cancelled','$carla');" >/dev/null
expect_value 'B13 sem vencidas pendentes o lote e vazio e nada e gravado' '0|0' \
  "$(svc "SELECT (SELECT count(*) FROM public.dispatch_scheduled_messages())::text || '|' \
              || (SELECT count(*) FROM public.messages)::text")"

# B15 — atraso de 10 min ainda envia (limite de 15 min tolerado)
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000030','$c1','dez minutos','text', now() - interval '10 min','pending','$carla');" >/dev/null
psql_sql "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")" >/dev/null
expect_value 'B15 atraso de 10 min: enviado normalmente' 'sent|1' \
  "SELECT (SELECT status FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000030') || '|' || (SELECT count(*) FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000030')"

# B16 — atraso de 20 min expira: nada e enfileirado, nao volta a processar
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000031','$c1','vinte minutos','text', now() - interval '20 min','pending','$carla');" >/dev/null
expect_value 'B16 atraso de 20 min: outcome expired com a mensagem certa' 'expired|expirada: atraso acima de 15 min' \
  "$(svc "SELECT outcome || '|' || failure_reason FROM public.dispatch_scheduled_messages()")"
expect_value 'B16b expirada: status e erro gravados, message_id nulo, nada enfileirado' 'expired|expirada: atraso acima de 15 min|NULO|0' \
  "SELECT status || '|' || error_message || '|' || coalesce(message_id::text, 'NULO') || '|' || (SELECT count(*) FROM public.messages)::text \
   FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000031'"
expect_value 'B16c expirada nao volta ao lote (0 linhas)' '0' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"

# B17 — conexao explicita desconectada vira failed conexao_invalida
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by, whatsapp_connection_id) VALUES
  ('d0000000-0000-0000-0000-000000000032','$c1','conn explicita','text', now() - interval '5 min','pending','$carla','$e2');" >/dev/null
expect_value 'B17 conexao explicita desconectada: failed conexao_invalida e message_id nulo' 'failed|conexao_invalida|NULO' \
  "$(svc "SELECT outcome || '|' || failure_reason || '|' || coalesce(message_id::text, 'NULO') FROM public.dispatch_scheduled_messages()")"
expect_value 'B17b nada foi enfileirado' '0' \
  "SELECT count(*) FROM public.messages"

# B18 — contato arquivado vira failed contato_bloqueado
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000033','$c4','arquivado','text', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B18 contato arquivado: failed contato_bloqueado' 'failed|contato_bloqueado' \
  "$(svc "SELECT outcome || '|' || failure_reason FROM public.dispatch_scheduled_messages()")"
expect_value 'B18b nada foi enfileirado' '0' \
  "SELECT count(*) FROM public.messages"

# B19 — dono sem nome no perfil: envia sem assinatura, conteudo intacto
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000034','$c1','sem assinatura aqui','text', now() - interval '5 min','pending','$admin');" >/dev/null
psql_sql "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")" >/dev/null
expect_value 'B19 sem nome no perfil: conteudo sai intacto, sem assinatura' '1|sem assinatura aqui' \
  "SELECT count(*)::text || '|' || min(content) FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-000000000034'"

# B20 — sem CHECK de maximo: agendar daqui a 1 ano e permitido
limpar
expect_value 'B20 agendar com 1 ano de antecedencia e permitido (sem teto)' '1' \
  "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by)
   VALUES ('d0000000-0000-0000-0000-000000000035','$c1','longe','text', now() + interval '1 year','pending','$carla')
   RETURNING 1"
expect_value 'B20b scheduled_messages.status segue sem CHECK de vocabulario ou prazo maximo' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.scheduled_messages'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'"

# B14 — ACL: quem pode e quem nao pode
expect_value 'B14 EXECUTE negado para authenticated/anon e concedido a service_role' 'false|false|true' \
  "SELECT has_function_privilege('authenticated','public.dispatch_scheduled_messages(integer)','EXECUTE')::text || '|' \
        || has_function_privilege('anon','public.dispatch_scheduled_messages(integer)','EXECUTE')::text || '|' \
        || has_function_privilege('service_role','public.dispatch_scheduled_messages(integer)','EXECUTE')::text"
expect_value 'B14b EXECUTE NAO concedido a PUBLIC' 'false' \
  "SELECT coalesce(bool_or(grantee = 0), false)::text \
   FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE proname = 'dispatch_scheduled_messages'), '{}'::aclitem[]))"
expect_error 'B14c authenticated nao executa a funcao' \
  'permission denied for function dispatch_scheduled_messages' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM public.dispatch_scheduled_messages()"
expect_error 'B14d anon nao executa a funcao' \
  'permission denied for function dispatch_scheduled_messages' \
  "SET ROLE anon; SELECT count(*) FROM public.dispatch_scheduled_messages()"

echo
echo '-- BLOCO C: concorrencia (FOR UPDATE SKIP LOCKED) ----------------------------------'
limpar
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-0000000000c1','$c1','concorrente','text', now() - interval '5 min','pending','$carla');" >/dev/null

docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SELECT id FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-0000000000c1' FOR UPDATE; SELECT pg_sleep(8);" \
  >/dev/null 2>&1 &
lock_pid=$!
sleep 2

expect_value 'C1 com a linha travada por outra sessao, o despacho pula o item (0 linhas)' '0' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"

wait "$lock_pid" || true

expect_value 'C2 apos liberar, o item e despachado uma vez (1 linha)' '1' \
  "$(svc "SELECT count(*) FROM public.dispatch_scheduled_messages()")"
expect_value 'C3 a mensagem saiu uma unica vez (sem duplicar)' '1|sent' \
  "SELECT (SELECT count(*) FROM public.messages WHERE client_message_id = 'd0000000-0000-0000-0000-0000000000c1')::text \
        || '|' || (SELECT status FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-0000000000c1')"

# B21 — enqueue que devolve zero linhas nao marca sent sem message_id
limpar
psql_sql "DROP FUNCTION public.enqueue_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text);" >/dev/null
psql_sql "CREATE FUNCTION public.enqueue_outbound_message(
  p_contact_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_message_type text DEFAULT 'text',
  p_media_url text DEFAULT NULL,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL,
  p_caption text DEFAULT NULL
) RETURNS SETOF public.messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS \$function\$ SELECT m.* FROM public.messages AS m WHERE false \$function\$;" >/dev/null
psql_sql "GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(uuid, uuid, text, text, text, uuid, uuid, text) TO authenticated, service_role;" >/dev/null
psql_sql "INSERT INTO public.scheduled_messages (id, contact_id, content, message_type, scheduled_at, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000021','$c1','zero linhas','text', now() - interval '5 min','pending','$carla');" >/dev/null
expect_value 'B21 enqueue sem linha: failed, motivo estavel e message_id nulo' 'failed|enqueue_returned_no_row|NULO|0' \
  "$(svc "WITH d AS (SELECT outcome, failure_reason, message_id FROM public.dispatch_scheduled_messages())
         SELECT outcome || '|' || failure_reason || '|' || coalesce(message_id::text, 'NULO') || '|' || (SELECT count(*) FROM public.messages)::text FROM d")"
expect_value 'B21b coluna message_id segue nula quando o enqueue nao devolve id' 'failed|enqueue_returned_no_row|NULO' \
  "SELECT status || '|' || error_message || '|' || coalesce(message_id::text, 'NULO')
   FROM public.scheduled_messages WHERE id = 'd0000000-0000-0000-0000-000000000021'"

echo
echo 'OK: contrato do despacho de agendadas verificado'
