#!/usr/bin/env bash
# Contrato executavel do TALK ME: elegibilidade, escopo por fila, busca,
# cursor, auditoria e exclusao mutua de dois aceites concorrentes.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930290000_talk_me_queue_claim.sql"
hardening_migration="$repo_root/supabase/migrations/20260930310000_harden_talk_me_authorization_and_groups.sql"
postgres_image="${TALK_ME_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talk-me-test-$$"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
  if [[ "$container_name" =~ ^zapp-v2-talk-me-test-[0-9]+$ ]]; then
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
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || fail "$label: deveria falhar"
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: erro nao continha '$needle'"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$hardening_migration" ]] || fail "migration nao encontrada: $hardening_migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

cat > "$tmp_dir/pre.sql" <<'SQL'
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.queues (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  color text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (queue_id, profile_id)
);
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  avatar_url text,
  company text,
  job_title text,
  queue_id uuid REFERENCES public.queues(id),
  assigned_to uuid,
  deleted_at timestamptz,
  conversation_status text NOT NULL DEFAULT 'open',
  channel_type text,
  contact_type text,
  group_category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  name text NOT NULL
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id),
  sender text NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  media_url text,
  caption text,
  is_deleted boolean,
  created_at timestamptz NOT NULL
);
CREATE INDEX idx_messages_contact_created ON public.messages(contact_id, created_at DESC);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.id FROM public.profiles p WHERE p.user_id=_user_id LIMIT 1
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role IN ('admin','supervisor'))
$$;
SQL
psql_file "$tmp_dir/pre.sql"
psql_file "$migration"
psql_file "$hardening_migration"

cat > "$tmp_dir/fixtures.sql" <<'SQL'
INSERT INTO public.profiles(id,user_id) VALUES
 ('a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001'),
 ('a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002'),
 ('a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000003'),
 ('a1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000004');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('b1000000-0000-0000-0000-000000000001','agent'),
 ('b1000000-0000-0000-0000-000000000002','agent'),
 ('b1000000-0000-0000-0000-000000000003','agent'),
 ('b1000000-0000-0000-0000-000000000004','admin');
INSERT INTO public.queues(id,name,color,is_active) VALUES
 ('10000000-0000-0000-0000-000000000001','Comercial','#2563eb',true),
 ('10000000-0000-0000-0000-000000000002','Financeiro','#16a34a',true),
 ('10000000-0000-0000-0000-000000000003','Desativada','#777777',false);
INSERT INTO public.queue_members(queue_id,profile_id) VALUES
 ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003');

INSERT INTO public.contacts(id,name,phone,company,job_title,queue_id,assigned_to,deleted_at,conversation_status,channel_type,contact_type,group_category,created_at) VALUES
 ('c1000000-0000-0000-0000-000000000001','Ana Antiga','551100000001','Acme','Compradora','10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000002','Sem Mensagem','551100000002',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000003','Ja Respondida','551100000003',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000004','Ja Atribuida','551100000004',NULL,NULL,'10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000005','Resolvida','551100000005',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'resolved','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000006','Grupo categorizado','120363000001-111@g.us',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente','clientes','2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000007','Outro Departamento','551100000007',NULL,NULL,'10000000-0000-0000-0000-000000000002',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000008','Bruno Novo','551100000008','Beta','Gerente','10000000-0000-0000-0000-000000000001',NULL,NULL,'waiting','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000009','Excluida','551100000009',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,'2026-09-01 08:00Z','open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000010','Instagram','551100000010',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','instagram','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000011','Revogacao','551100000011',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000012','Corrida Revogacao','551100000012',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000013','Mesmo Instante','551100000013',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000014','Grupo Relacional','120363000002-222',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z'),
 ('c1000000-0000-0000-0000-000000000015','Grupo pelo JID','120363000003-333@g.us',NULL,NULL,'10000000-0000-0000-0000-000000000001',NULL,NULL,'open','whatsapp','cliente',NULL,'2026-09-01 08:00Z');

INSERT INTO public.whatsapp_groups(group_id,name)
VALUES ('120363000002-222@g.us','Grupo sem categoria no contato');

INSERT INTO public.messages(id,contact_id,sender,content,created_at) VALUES
 ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','agent','Como posso ajudar?','2026-09-01 08:00Z'),
 ('d1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','contact','Primeira sem resposta','2026-09-01 09:00Z'),
 ('d1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','contact','Segunda sem resposta','2026-09-01 09:05Z'),
 ('d1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000003','contact','Pergunta','2026-09-01 07:00Z'),
 ('d1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000003','agent','Resposta','2026-09-01 11:00Z'),
 ('d1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000004','contact','Atribuida','2026-09-01 09:10Z'),
 ('d1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000005','contact','Resolvida','2026-09-01 09:20Z'),
 ('d1000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000006','contact','Grupo','2026-09-01 09:30Z'),
 ('d1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000007','contact','Financeiro','2026-09-01 09:40Z'),
 ('d1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000008','contact','Mensagem nova','2026-09-01 10:00Z'),
 ('d1000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000009','contact','Excluida','2026-09-01 10:10Z'),
 ('d1000000-0000-0000-0000-000000000012','c1000000-0000-0000-0000-000000000010','contact','Instagram','2026-09-01 10:20Z'),
 ('d1000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000011','contact','Ainda aguardando','2026-09-01 10:30Z'),
 ('d1000000-0000-0000-0000-000000000014','c1000000-0000-0000-0000-000000000012','contact','Aceite concorrente','2026-09-01 10:40Z'),
 ('d1000000-0000-0000-0000-000000000015','c1000000-0000-0000-0000-000000000013','agent','Agente no mesmo instante','2026-09-01 10:50Z'),
 ('d1000000-0000-0000-0000-000000000016','c1000000-0000-0000-0000-000000000013','contact','Contato no mesmo instante','2026-09-01 10:50Z'),
 ('d1000000-0000-0000-0000-000000000017','c1000000-0000-0000-0000-000000000014','contact','Grupo relacional','2026-09-01 11:00Z'),
 ('d1000000-0000-0000-0000-000000000018','c1000000-0000-0000-0000-000000000015','contact','Grupo por JID','2026-09-01 11:05Z');
SQL
psql_file "$tmp_dir/fixtures.sql"

agent1='b1000000-0000-0000-0000-000000000001'
agent2='b1000000-0000-0000-0000-000000000002'
outsider='b1000000-0000-0000-0000-000000000003'
admin='b1000000-0000-0000-0000-000000000004'
queue1='10000000-0000-0000-0000-000000000001'
queue2='10000000-0000-0000-0000-000000000002'
contact1='c1000000-0000-0000-0000-000000000001'
contact8='c1000000-0000-0000-0000-000000000008'
contact11='c1000000-0000-0000-0000-000000000011'

as_user() { local user="$1" sql="$2"; psql_sql "SET app.user_id='$user'; $sql"; }

expect_value 'A1 agente ve apenas sua fila ativa' 'Comercial|5' \
  "SET app.user_id='$agent1'; SELECT queue_name||'|'||waiting_count FROM public.talk_me_list_queues()"
expect_value 'A2 cadastros vazios, respondidos, atribuidos, resolvidos, grupos, excluidos e outros canais nao entram' '5' \
  "SET app.user_id='$agent1'; SELECT count(*) FROM public.talk_me_list_waiting('$queue1',NULL,50,NULL,NULL)"
expect_value 'A3 ordem usa a primeira mensagem ainda sem resposta e desempate estavel' 'Ana Antiga|2026-09-01 09:00:00+00|2|Segunda sem resposta' \
  "SET app.user_id='$agent1'; SELECT contact_name||'|'||waiting_since||'|'||pending_message_count||'|'||last_message_content FROM public.talk_me_list_waiting('$queue1',NULL,50,NULL,NULL) ORDER BY queue_position LIMIT 1"
expect_value 'A4 busca no servidor encontra empresa sem depender da pagina carregada' 'Ana Antiga' \
  "SET app.user_id='$agent1'; SELECT contact_name FROM public.talk_me_list_waiting('$queue1','Acme',50,NULL,NULL)"
expect_value 'A5 cursor devolve somente itens posteriores' 'Bruno Novo,Revogacao,Corrida Revogacao,Mesmo Instante' \
  "SET app.user_id='$agent1'; SELECT string_agg(contact_name,',' ORDER BY queue_position) FROM public.talk_me_list_waiting('$queue1',NULL,50,'2026-09-01 09:00Z','$contact1')"
expect_value 'A6 agente de outra fila nao recebe dados do Comercial' '0' \
  "SET app.user_id='$outsider'; SELECT count(*) FROM public.talk_me_list_waiting('$queue1',NULL,50,NULL,NULL)"
expect_value 'A7 administrador ve todas as filas ativas' '2' \
  "SET app.user_id='$admin'; SELECT count(*) FROM public.talk_me_list_queues()"
expect_value 'A8 anonimo nao recebe filas' '0' \
  "RESET app.user_id; SELECT count(*) FROM public.talk_me_list_queues()"
expect_error 'A9 anonimo nao pode aceitar' 'authentication_required' \
  "RESET app.user_id; SELECT * FROM public.talk_me_claim('$contact1')"
expect_error 'A10 role anon nao possui EXECUTE nas RPCs' 'permission denied' \
  "SET ROLE anon; SELECT count(*) FROM public.talk_me_list_queues()"
expect_value 'A11 role authenticated executa com sessao valida' '1' \
  "SET ROLE authenticated; SET app.user_id='$agent1'; SELECT count(*) FROM public.talk_me_list_queues()"
expect_value 'A12 desempate por id inclui contato posterior no mesmo timestamp' '1|Contato no mesmo instante' \
  "SET app.user_id='$agent1'; SELECT pending_message_count||'|'||last_message_content FROM public.talk_me_list_waiting('$queue1','Mesmo Instante',50,NULL,NULL)"
expect_value 'A13 grupos por categoria, telefone e registro relacional nao entram' '0' \
  "SET app.user_id='$agent1'; SELECT count(*) FROM public.talk_me_list_waiting('$queue1','Grupo',50,NULL,NULL)"

expect_value 'B1 aceite atribui ao perfil autenticado e abre a conversa' "${contact1}|a1000000-0000-0000-0000-000000000001|open" \
  "SET app.user_id='$agent1'; SELECT contact_id||'|'||assigned_to||'|'||conversation_status FROM public.talk_me_claim('$contact1')"
expect_value 'B2 aceite gera auditoria minima com origem TALK ME' 'talk_me_claim|talk_me' \
  "SELECT action||'|'||(details->>'source') FROM public.audit_logs WHERE entity_id='$contact1'"
expect_value 'B3 retry do vencedor e idempotente' "${contact1}|a1000000-0000-0000-0000-000000000001|open" \
  "SET app.user_id='$agent1'; SELECT contact_id||'|'||assigned_to||'|'||conversation_status FROM public.talk_me_claim('$contact1')"
expect_value 'B4 retry nao duplica auditoria' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE entity_id='$contact1' AND action='talk_me_claim'"
expect_error 'B5 segundo agente perde sem sobrescrever responsavel' 'talk_me_unavailable' \
  "SET app.user_id='$agent2'; SELECT * FROM public.talk_me_claim('$contact1')"

# A permissao e revalidada no clique: o agente 2 viu o item, perde o vinculo e
# a RPC falha sem revelar estado adicional do contato.
expect_value 'C1 agente 2 ve o item antes da revogacao' '2' \
  "SET app.user_id='$agent2'; SELECT count(*) FROM public.talk_me_list_waiting('$queue1','Revogacao',50,NULL,NULL)"
psql_sql "UPDATE public.queue_members SET is_active=false WHERE queue_id='$queue1' AND profile_id='a1000000-0000-0000-0000-000000000002'" >/dev/null
expect_error 'C2 permissao revogada com tela aberta bloqueia o aceite' 'talk_me_unavailable' \
  "SET app.user_id='$agent2'; SELECT * FROM public.talk_me_claim('$contact11')"
psql_sql "UPDATE public.queue_members SET is_active=true WHERE queue_id='$queue1' AND profile_id='a1000000-0000-0000-0000-000000000002'" >/dev/null

psql_sql "UPDATE public.feature_flags SET enabled=false WHERE key='inbox.talk-me'" >/dev/null
expect_value 'C3 flag desligada esvazia as filas no servidor' '0' \
  "SET app.user_id='$agent2'; SELECT count(*) FROM public.talk_me_list_queues()"
expect_error 'C4 flag desligada bloqueia aceite direto' 'talk_me_unavailable' \
  "SET app.user_id='$agent2'; SELECT * FROM public.talk_me_claim('$contact11')"
expect_value 'C5 flag desligada nao atribui nem audita' '1|0' \
  "SELECT (count(*) FILTER (WHERE assigned_to IS NULL))||'|'||(SELECT count(*) FROM public.audit_logs WHERE entity_id='$contact11') FROM public.contacts WHERE id='$contact11'"
psql_sql "UPDATE public.feature_flags SET enabled=true WHERE key='inbox.talk-me'" >/dev/null

psql_sql "UPDATE public.profiles SET is_active=false WHERE id='a1000000-0000-0000-0000-000000000002'" >/dev/null
expect_value 'C6 perfil inativo nao lista filas' '0' \
  "SET app.user_id='$agent2'; SELECT count(*) FROM public.talk_me_list_queues()"
expect_error 'C7 perfil inativo nao aceita' 'talk_me_unavailable' \
  "SET app.user_id='$agent2'; SELECT * FROM public.talk_me_claim('$contact11')"
expect_value 'C8 perfil inativo nao atribui nem audita' '1|0' \
  "SELECT (count(*) FILTER (WHERE assigned_to IS NULL))||'|'||(SELECT count(*) FROM public.audit_logs WHERE entity_id='$contact11') FROM public.contacts WHERE id='$contact11'"
psql_sql "UPDATE public.profiles SET is_active=true WHERE id='a1000000-0000-0000-0000-000000000002'" >/dev/null

# A chamada comeca autorizada e para na leitura de messages. A revogacao que
# confirma antes do UPDATE final deve vencer e impedir atribuicao/auditoria.
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "BEGIN; LOCK TABLE public.messages IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(3); COMMIT" \
  >"$tmp_dir/message-lock.out" 2>"$tmp_dir/message-lock.err" & lock_pid=$!
for _ in $(seq 1 30); do
  [[ "$(psql_sql "SELECT count(*) FROM pg_locks WHERE relation='public.messages'::regclass AND mode='AccessExclusiveLock' AND granted")" == '1' ]] && break
  sleep 0.1
done
set +e
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET app.user_id='$agent2'; SELECT * FROM public.talk_me_claim('c1000000-0000-0000-0000-000000000012')" \
  >"$tmp_dir/revoked-race.out" 2>"$tmp_dir/revoked-race.err" & race_pid=$!
set -e
for _ in $(seq 1 30); do
  [[ "$(psql_sql "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%talk_me_claim(''c1000000-0000-0000-0000-000000000012'')%' AND wait_event_type='Lock'")" == '1' ]] && break
  sleep 0.1
done
psql_sql "UPDATE public.queue_members SET is_active=false WHERE queue_id='$queue1' AND profile_id='a1000000-0000-0000-0000-000000000002'" >/dev/null
set +e
wait "$race_pid"; race_status=$?
wait "$lock_pid"; lock_status=$?
set -e
(( lock_status == 0 )) || fail 'C9 locker da corrida falhou'
(( race_status != 0 )) || fail 'C9 aceite concorrente deveria falhar apos revogacao confirmada'
grep -q 'talk_me_unavailable' "$tmp_dir/revoked-race.err" || fail 'C9 erro concorrente nao foi talk_me_unavailable'
expect_value 'C9 revogacao concorrente vence antes do UPDATE final' '1|0' \
  "SELECT (count(*) FILTER (WHERE assigned_to IS NULL))||'|'||(SELECT count(*) FROM public.audit_logs WHERE entity_id='c1000000-0000-0000-0000-000000000012') FROM public.contacts WHERE id='c1000000-0000-0000-0000-000000000012'"
psql_sql "UPDATE public.queue_members SET is_active=true WHERE queue_id='$queue1' AND profile_id='a1000000-0000-0000-0000-000000000002'" >/dev/null

# Dois processos reais competem pela mesma linha. O SELECT ... FOR UPDATE da RPC
# serializa os cliques; exatamente um processo conclui e o outro recebe conflito.
set +e
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET app.user_id='$agent1'; SELECT contact_id FROM public.talk_me_claim('$contact8')" \
  >"$tmp_dir/claim-1.out" 2>"$tmp_dir/claim-1.err" & pid1=$!
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET app.user_id='$agent2'; SELECT contact_id FROM public.talk_me_claim('$contact8')" \
  >"$tmp_dir/claim-2.out" 2>"$tmp_dir/claim-2.err" & pid2=$!
wait "$pid1"; status1=$?
wait "$pid2"; status2=$?
set -e
successes=0
(( status1 == 0 )) && successes=$((successes + 1))
(( status2 == 0 )) && successes=$((successes + 1))
[[ "$successes" == '1' ]] || fail "D1 concorrencia: esperado 1 vencedor, obtidos $successes"
printf '[PASS] D1 dois aceites simultaneos produzem exatamente um vencedor\n'
expect_value 'D2 contato concorrente termina com exatamente um responsavel' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='$contact8' AND assigned_to IN ('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002')"
expect_value 'D3 concorrencia gera um unico evento de auditoria' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE entity_id='$contact8' AND action='talk_me_claim'"

expect_error 'E1 agente nao pode aceitar conversa de outra fila' 'talk_me_unavailable' \
  "SET app.user_id='$agent1'; SELECT * FROM public.talk_me_claim('c1000000-0000-0000-0000-000000000007')"
expect_value 'E2 contato fora do escopo permanece sem responsavel' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='c1000000-0000-0000-0000-000000000007' AND assigned_to IS NULL"

printf '\n[OK] contrato TALK ME verificado\n'
