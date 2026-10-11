#!/usr/bin/env bash
# Prova de permissao e contrato do log de tentativas de envio (message_attempts).
# Postgres descartavel: aplica as migrations REAIS (helpers canonicos de visibilidade,
# RLS consolidada de messages e a migration desta tarefa) e executa como o PAPEL REAL
# (authenticated com JWT, anon, service_role) — nunca como postgres.
#
# REGISTRO PENDENTE: scripts/db-audit/message-attempts-log.test.sh
#   (teste novo; falta o passo correspondente em .github/workflows/db-guard.yml, que
#    pertence ao worker (ci) — ver .hermes-tarefa / relato)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011124430_message_attempts.sql"
helpers_migration="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
messages_rls_migration="$repo_root/supabase/migrations/20260902023200_consolidate_rls_select_messages_contacts.sql"
postgres_image="${MESSAGE_ATTEMPTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-message-attempts-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-message-attempts-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
expect_failure() {
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

# ---------------------------------------------------------------------------
# Base minima: ambiente do Postgres do Supabase (papeis, auth.uid/role) + as
# tabelas que as migrations reais tocam. NAO recria a migration sob teste.
# ---------------------------------------------------------------------------
psql_sql "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') \$\$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'agent', is_active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
  CREATE TABLE public.agent_visibility_grants (
    agent_id uuid NOT NULL REFERENCES public.profiles(id),
    can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id),
    PRIMARY KEY (agent_id, can_see_agent_id)
  );
  CREATE TABLE public.queues (id uuid PRIMARY KEY);
  CREATE TABLE public.queue_members (
    queue_id uuid NOT NULL REFERENCES public.queues(id),
    profile_id uuid NOT NULL REFERENCES public.profiles(id),
    is_active boolean NOT NULL,
    PRIMARY KEY (queue_id, profile_id)
  );
  CREATE TABLE public.contacts (
    id uuid PRIMARY KEY,
    assigned_to uuid REFERENCES public.profiles(id),
    queue_id uuid REFERENCES public.queues(id)
  );
  CREATE TABLE public.messages (
    id uuid PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    media_url text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.conversation_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    status text
  );
  CREATE TABLE public.contact_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    content text NOT NULL
  );
  CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
    AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='admin') \$\$;
  CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
    AS \$\$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=p_user_id AND is_active AND role IN ('admin','supervisor')) \$\$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
" >/dev/null

# Predicado canonico de visibilidade + RLS consolidada de messages (migrations REAIS).
psql_file "$helpers_migration" >/dev/null
psql_file "$messages_rls_migration" >/dev/null

# ---------------------------------------------------------------------------
# Dados sinteticos
#   UA  = admin (profile role admin + user_roles admin)
#   UAG = agente dono do contato C1 (ve a mensagem M1)
#   UOU = agente sem vinculo (nao ve nada)
# ---------------------------------------------------------------------------
psql_sql "
  INSERT INTO public.profiles (id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin'),
    ('11111111-1111-1111-1111-111111111112','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','agent'),
    ('11111111-1111-1111-1111-111111111113','cccccccc-cccc-cccc-cccc-cccccccccccc','agent');
  INSERT INTO public.user_roles (user_id, role) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin');
  INSERT INTO public.queues (id) VALUES ('22222222-2222-2222-2222-222222222222');
  INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES
    ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111112','22222222-2222-2222-2222-222222222222'),
    ('33333333-3333-3333-3333-333333333332',NULL,NULL);
  INSERT INTO public.messages (id, contact_id, media_url) VALUES
    ('44444444-4444-4444-4444-444444444441','33333333-3333-3333-3333-333333333331',NULL),
    ('44444444-4444-4444-4444-444444444442','33333333-3333-3333-3333-333333333332',NULL);
" >/dev/null

UA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
UAG='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
UOU='cccccccc-cccc-cccc-cccc-cccccccccccc'
M1='44444444-4444-4444-4444-444444444441'
M2='44444444-4444-4444-4444-444444444442'

# --- BLOCO A: a RLS de messages (predicado que a funcao espelha) esta viva ---
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.messages WHERE id='$M1';")" == '1' ]] \
  || fail 'baseline: dono do contato nao le a mensagem pela RLS de messages'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UOU'; SELECT count(*) FROM public.messages WHERE id='$M1';")" == '0' ]] \
  || fail 'baseline: outsider leu a mensagem'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UA'; SELECT count(*) FROM public.messages;")" == '2' ]] \
  || fail 'baseline: admin nao leu todas as mensagens'

# ---------------------------------------------------------------------------
# Aplica a migration sob teste
# ---------------------------------------------------------------------------
psql_file "$migration" >/dev/null

# --- Estrutura -------------------------------------------------------------
cols="$(psql_sql "SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='message_attempts';")"
[[ "$cols" == 'id,message_id,attempt_no,outcome,error_code,error_message,provider_status,provider_response,duration_ms,created_at' ]] \
  || fail "colunas inesperadas: $cols"
[[ "$(psql_sql "SELECT relrowsecurity FROM pg_class WHERE oid='public.message_attempts'::regclass;")" == 't' ]] \
  || fail 'RLS de message_attempts nao esta habilitado'
[[ "$(psql_sql "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='message_attempts' AND indexdef LIKE '%(message_id, created_at)%';")" == '1' ]] \
  || fail 'indice (message_id, created_at) ausente'
[[ "$(psql_sql "SELECT count(*) FROM pg_constraint WHERE conrelid='public.message_attempts'::regclass AND contype='u' AND pg_get_constraintdef(oid) LIKE '%message_id, attempt_no, outcome%';")" == '1' ]] \
  || fail 'unique (message_id, attempt_no, outcome) ausente'
[[ "$(psql_sql "SELECT count(*) FROM pg_constraint WHERE conrelid='public.message_attempts'::regclass AND contype='c';")" == '2' ]] \
  || fail 'CHECKs de outcome/error_message ausentes'

# --- ACL da tabela ---------------------------------------------------------
[[ "$(psql_sql "SELECT has_table_privilege('anon','public.message_attempts','SELECT');")" == 'f' ]] \
  || fail 'anon conseguiu SELECT na tabela'
[[ "$(psql_sql "SELECT has_table_privilege('authenticated','public.message_attempts','SELECT');")" == 't' ]] \
  || fail 'authenticated perdeu o SELECT da tabela'
[[ "$(psql_sql "SELECT has_table_privilege('authenticated','public.message_attempts','INSERT,UPDATE,DELETE');")" == 'f' ]] \
  || fail 'authenticated ganhou escrita direta na tabela'

# --- ACL das funcoes (pela assinatura exata) -------------------------------
LOG_SIG='public.log_message_attempt(uuid,integer,text,text,text,integer,jsonb,integer)'
[[ "$(psql_sql "SELECT has_function_privilege('service_role','$LOG_SIG','EXECUTE');")" == 't' ]] \
  || fail 'service_role nao executa log_message_attempt'
[[ "$(psql_sql "SELECT has_function_privilege('authenticated','$LOG_SIG','EXECUTE');")" == 'f' ]] \
  || fail 'authenticated executa log_message_attempt'
[[ "$(psql_sql "SELECT has_function_privilege('anon','$LOG_SIG','EXECUTE');")" == 'f' ]] \
  || fail 'anon executa log_message_attempt'
[[ "$(psql_sql "SELECT proacl::text !~ '[{,]=X/' FROM pg_proc WHERE oid='$LOG_SIG'::regprocedure;")" == 't' ]] \
  || fail 'PUBLIC conservou EXECUTE em log_message_attempt'
[[ "$(psql_sql "SELECT has_function_privilege('authenticated','public.list_message_attempts(uuid)','EXECUTE') AND has_function_privilege('anon','public.list_message_attempts(uuid)','EXECUTE');")" == 'f' ]] \
  || fail 'list_message_attempts deveria negar anon e permitir authenticated'
[[ "$(psql_sql "SELECT has_function_privilege('authenticated','public.list_message_attempts(uuid)','EXECUTE');")" == 't' ]] \
  || fail 'authenticated nao executa list_message_attempts'
[[ "$(psql_sql "SELECT has_function_privilege('anon','public.list_message_attempts_admin(uuid)','EXECUTE');")" == 'f' ]] \
  || fail 'anon executa list_message_attempts_admin'
[[ "$(psql_sql "SELECT has_function_privilege('authenticated','public.list_message_attempts_admin(uuid)','EXECUTE');")" == 't' ]] \
  || fail 'authenticated nao executa list_message_attempts_admin'

# --- Escrita: idempotencia e entrada invalida (service_role) ----------------
[[ "$(psql_sql "SET ROLE service_role; SELECT public.log_message_attempt('$M1',1,'claimed');")" == 't' ]] \
  || fail 'log_message_attempt nao inseriu a tentativa 1'
[[ "$(psql_sql "SET ROLE service_role; SELECT public.log_message_attempt('$M1',1,'claimed');")" == 'f' ]] \
  || fail 'log_message_attempt nao foi idempotente na repeticao'
[[ "$(psql_sql "SET ROLE service_role; SELECT public.log_message_attempt('$M1',2,'failed_retryable','E_TIME','timeout do provedor',500,'{\"provider\":\"x\",\"status\":500}',1234);")" == 't' ]] \
  || fail 'log_message_attempt nao inseriu a falha da tentativa 2'
[[ "$(psql_sql "SELECT count(*) FROM public.message_attempts WHERE message_id='$M1';")" == '2' ]] \
  || fail 'a repeticao duplicou linha na tabela'
[[ "$(psql_sql "SET ROLE service_role; SELECT public.log_message_attempt('$M1',3,'claimed');")" == 't' ]] \
  || fail 'outcome distinto na mesma tentativa deveria inserir (chave inclui outcome)'
[[ "$(psql_sql "SELECT count(*) FROM public.message_attempts WHERE message_id='$M1';")" == '3' ]] \
  || fail 'chave unica (message_id, attempt_no, outcome) nao permitiu o novo outcome'

expect_failure 'outcome invalido' "SET ROLE service_role; SELECT public.log_message_attempt('$M1',4,'bogus');"
expect_failure 'attempt_no invalido' "SET ROLE service_role; SELECT public.log_message_attempt('$M1',0,'claimed');"
expect_failure 'message_id inexistente' "SET ROLE service_role; SELECT public.log_message_attempt('44444444-4444-4444-4444-4444444444ff',1,'claimed');"
expect_failure 'error_message acima de 500' "SET ROLE service_role; SELECT public.log_message_attempt('$M1',5,'failed_final',NULL,repeat('x',501));"

# authenticated NAO escreve direto
expect_failure 'authenticated inserindo direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; INSERT INTO public.message_attempts (message_id,attempt_no,outcome) VALUES ('$M1',9,'claimed');"
expect_failure 'authenticated chamando log_message_attempt' "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT public.log_message_attempt('$M1',9,'claimed');"

# --- Leitura: agente com acesso, sem acesso, admin e anon -------------------
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.list_message_attempts('$M1');")" == '3' ]] \
  || fail 'agente com acesso nao leu o resumo das tentativas'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.list_message_attempts('$M2');")" == '0' ]] \
  || fail 'agente sem acesso (mensagem oculta) leu tentativas'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UOU'; SELECT count(*) FROM public.list_message_attempts('$M1');")" == '0' ]] \
  || fail 'outsider leu tentativas'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UA'; SELECT count(*) FROM public.list_message_attempts('$M1');")" == '3' ]] \
  || fail 'admin nao leu o resumo das tentativas'
# mensagem inexistente devolve o mesmo que sem acesso (sem oraculo de existencia)
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UOU'; SELECT count(*) FROM public.list_message_attempts('44444444-4444-4444-4444-4444444444ff');")" == '0' ]] \
  || fail 'mensagem inexistente vazou existencia'
# o resumo NAO expoe provider_response; a visao do admin expoe
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT to_jsonb(t) ? 'provider_response' FROM public.list_message_attempts('$M1') AS t LIMIT 1;")" == 'f' ]] \
  || fail 'resumo do agente expoe provider_response'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UA'; SELECT to_jsonb(t) ? 'provider_response' FROM public.list_message_attempts_admin('$M1') AS t LIMIT 1;")" == 't' ]] \
  || fail 'visao do admin nao traz provider_response'

expect_failure 'nao-admin pedindo a visao completa' "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT * FROM public.list_message_attempts_admin('$M1');"
expect_failure 'anon pedindo o resumo' "SET ROLE anon; SELECT * FROM public.list_message_attempts('$M1');"
expect_failure 'anon pedindo a visao completa' "SET ROLE anon; SELECT * FROM public.list_message_attempts_admin('$M1');"
expect_failure 'anon lendo a tabela direto' "SET ROLE anon; SELECT count(*) FROM public.message_attempts;"

# admin lendo a tabela direto (RLS libera) e nao-admin barrado pela RLS
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UA'; SELECT count(*) FROM public.message_attempts;")" == '3' ]] \
  || fail 'admin nao leu a tabela pela RLS'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.message_attempts;")" == '0' ]] \
  || fail 'nao-admin leu a tabela pela RLS'

# ---------------------------------------------------------------------------
# ROLLBACK: extrai as linhas executaveis do proprio cabecalho da migration
# ---------------------------------------------------------------------------
rollback_file="$(mktemp /tmp/zapp-message-attempts-rollback.XXXXXX.sql)"
trap 'rm -f "$rollback_file"; cleanup' EXIT INT TERM
grep -iE '^--   (drop|create|alter|revoke|grant|comment) ' "$migration" \
  | sed -E 's/^--   //' > "$rollback_file"
[[ "$(wc -l < "$rollback_file")" -ge 4 ]] || fail 'rollback extraido do cabecalho ficou incompleto'
psql_file "$rollback_file" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_class WHERE relname='message_attempts' AND relnamespace='public'::regnamespace;")" == '0' ]] \
  || fail 'rollback nao removeu a tabela'
[[ "$(psql_sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('log_message_attempt','list_message_attempts','list_message_attempts_admin');")" == '0' ]] \
  || fail 'rollback nao removeu as funcoes'

# Reaplica: a migration e idempotente e o estado volta
psql_file "$migration" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_class WHERE relname='message_attempts' AND relnamespace='public'::regnamespace;")" == '1' ]] \
  || fail 'reaplicacao nao recriou a tabela'
[[ "$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='message_attempts';")" == '1' ]] \
  || fail 'reaplicacao nao recriou a policy exatamente uma vez'

printf '[OK] message_attempts: contrato, idempotencia, RLS (admin/agente/outsider/anon) e rollback validados em PostgreSQL 17.\n'
