#!/usr/bin/env bash
#
# R2-AUTH-036 (Sala de Crise): prova, em PostgreSQL 17 descartável, que a RPC
# public.crisis_room_snapshot() mede as 4 métricas da tela num único agregado
# no banco — sem o corte de 1.000 linhas do PostgREST e sem o SLA contando o
# histórico inteiro — e que ela NEGA quem não é admin/supervisor com exceção,
# nunca com zeros ("falha de medição não vira operação normal").
#
# Roda como o PAPEL real (authenticated + claim de sub, anon, service_role),
# nunca como postgres para julgar autorização.
#
# Cenários que o teste obriga a valer:
#   1. números corretos de mensagens/contatos pendentes (resposta posterior conta);
#   2. presença real (heartbeat recente) e universo habilitado, não profiles.is_active;
#   3. SLA restrito às últimas 24 h (o histórico antigo NÃO infla);
#   4. queue_ratio NULL quando não há agente online (não 0);
#   5. operação grande: o agregado passa de 1.000 (o LIMIT 1000 do PostgREST não morde);
#   6. agente comum, anon e service_role: exceção/permissão negada, sem zeros.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261013140359_crisis_room_snapshot.sql"
postgres_image="${CRISIS_ROOM_SNAPSHOT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-crisis-room-snapshot-test-$$"
passed=0

admin_user="11111111-1111-1111-1111-111111111111"
agent_user="22222222-2222-2222-2222-222222222222"
offline_user="33333333-3333-3333-3333-333333333333"
disabled_user="44444444-4444-4444-4444-444444444444"

cleanup() {
  if [[ "$container_name" =~ ^zapp-crisis-room-snapshot-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_script() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

# Chama a RPC como um ator autenticado (papel authenticated + claim `sub`), o
# mesmo mecanismo do harness real. `expr` é uma expressão SQL que usa o retorno.
call_as() {
  local sub="$1" expr="$2"
  docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$sub';
SELECT $expr;
COMMIT;
SQL
}

# Chama a RPC como um papel arbitrário (anon/service_role) e devolve saída+status.
call_as_role() {
  local role="$1" out_var="$2" status_var="$3" output status
  set +e
  output="$(docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE $role;
SELECT public.crisis_room_snapshot();
COMMIT;
SQL
)"
  status=$?
  set -e
  printf -v "$out_var" '%s' "$output"
  printf -v "$status_var" '%s' "$status"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  ((passed += 1))
  printf '[PASS] %s (= %s)\n' "$label" "$actual"
}

assert_denied() {
  local label="$1" output="$2" status="$3" needle="$4"
  if (( status == 0 )); then
    fail "$label: a chamada deveria falhar (nao devolver zeros), mas saiu 0"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: faltou a marca '$needle' no erro"
  fi
  if [[ "$output" =~ (unanswered_messages|online_agents|queue_ratio) ]]; then
    fail "$label: o erro vazou o payload de metricas"
  fi
  ((passed += 1))
  printf '[PASS] %s (negado com excecao)\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only \
  "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'

# --- Fixture: o mínimo real que a RPC toca, incluindo auth.uid() e a barreira
#     de papel (mesma definição viva de is_admin_or_supervisor). ---------------
psql_script >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);

-- Mesma definição da migration 20251215025014 (admin/supervisor via user_roles).
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean,
  role text
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sender text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_presence (
  user_id uuid PRIMARY KEY,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  first_message_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  first_response_breached boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.user_roles(user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'agent'),
  ('33333333-3333-3333-3333-333333333333', 'agent');

INSERT INTO public.profiles(id, user_id, is_active, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true, 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', true, 'agent'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', true, 'agent'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', false, 'agent');

-- Presença: agente 02 com heartbeat agora; agente 03 com heartbeat velho
-- (5 min); usuário desabilitado 04 "online" mas fora do universo habilitado.
INSERT INTO public.agent_presence(user_id, status, updated_at) VALUES
  ('22222222-2222-2222-2222-222222222222', 'online', now()),
  ('33333333-3333-3333-3333-333333333333', 'online', now() - interval '5 minutes'),
  ('44444444-4444-4444-4444-444444444444', 'online', now());

-- Conversas:
--   c1: recebida 30 min atrás, RESPONDIDA 20 min atrás -> não é pendência
--   c2: recebida 10 min atrás, sem resposta -> pendência
--   c3: recebida 50 min atrás, resposta 55 min atrás (ANTERIOR) -> pendência
--   c4: recebida 90 min atrás (fora da janela) -> ignorada
--   sem contato: contact_id NULL -> ignorada (a pendência é por conversa)
INSERT INTO public.messages(contact_id, sender, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'contact', now() - interval '30 minutes'),
  ('c0000000-0000-0000-0000-000000000001', 'agent',   now() - interval '20 minutes'),
  ('c0000000-0000-0000-0000-000000000002', 'contact', now() - interval '10 minutes'),
  ('c0000000-0000-0000-0000-000000000003', 'contact', now() - interval '50 minutes'),
  ('c0000000-0000-0000-0000-000000000003', 'agent',   now() - interval '55 minutes'),
  ('c0000000-0000-0000-0000-000000000004', 'contact', now() - interval '90 minutes'),
  (NULL, 'contact', now() - interval '5 minutes');

-- SLA: s1 aberto (sem resposta) e s2 estourado nas últimas 24h contam;
-- s3 estourado há 48h NÃO conta (era o defeito: histórico inteiro); s4 ok.
INSERT INTO public.conversation_sla(id, first_response_at, first_response_breached, created_at) VALUES
  ('50000000-0000-0000-0000-000000000001', NULL, true, now() - interval '3 hours'),
  ('50000000-0000-0000-0000-000000000002', now() - interval '2 hours', true, now() - interval '2 hours'),
  ('50000000-0000-0000-0000-000000000003', now() - interval '48 hours', true, now() - interval '48 hours'),
  ('50000000-0000-0000-0000-000000000004', now() - interval '2 hours', false, now() - interval '2 hours');
SQL

apply_migration() { psql_script < "$migration" >/dev/null; }

# --- Estado ANTES da migration: a RPC não existe (o defeito é a ausência) ----
if psql_query "SELECT count(*) FROM pg_proc WHERE proname = 'crisis_room_snapshot'" | grep -qv '^0$'; then
  fail 'a RPC ja existia antes da migration: o vermelho-antes nao vale'
fi
printf '[PASS] vermelho antes: public.crisis_room_snapshot() ainda nao existia\n'

apply_migration
apply_migration   # idempotencia: reaplicar nao pode falhar

# --- Verdade da forma: SECURITY DEFINER + STABLE + search_path fixo -----------
assert_eq 'funcao e SECURITY DEFINER' 't' \
  "$(psql_query "SELECT prosecdef FROM pg_proc WHERE proname = 'crisis_room_snapshot'")"
assert_eq 'funcao e STABLE' 's' \
  "$(psql_query "SELECT provolatile FROM pg_proc WHERE proname = 'crisis_room_snapshot'")"
assert_eq 'search_path fixo (public, pg_temp)' 'search_path=public, pg_temp' \
  "$(psql_query "SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname = 'crisis_room_snapshot'")"

# --- Métricas corretas, medidas como o admin (papel authenticated) ------------
assert_eq 'unanswered_messages (c2+c3)' '2' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'unanswered_messages'")"
assert_eq 'unanswered_conversations (2 contatos)' '2' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'unanswered_conversations'")"
assert_eq 'online_agents (so presenca fresca e habilitada)' '1' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'online_agents'")"
assert_eq 'total_agents (habilitados de atendimento)' '3' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'total_agents'")"
assert_eq 'sla_breached (so 24h)' '2' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'sla_breached'")"
assert_eq 'queue_ratio (2 conv / 1 online)' '2.00' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'queue_ratio'")"

# --- Operação grande: o agregado do banco nao sofre o corte de 1.000 ---------
psql_script >/dev/null <<'SQL'
INSERT INTO public.messages(contact_id, sender, created_at)
SELECT ('c0000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'contact', now() - interval '15 minutes'
FROM generate_series(10, 1509) g;
SQL
big_total="$(call_as "$admin_user" "public.crisis_room_snapshot()->>'unanswered_messages'")"
[[ "$big_total" == '1502' ]] || fail "operacao grande: esperado 1502, obtido $big_total"
((passed += 1))
printf '[PASS] operacao grande: agregado = 1502 (acima do corte)\n'

# A ponte antiga (PostgREST) cortava em 1.000 linhas e mentia para baixo.
naive="$(psql_query "SELECT count(*) FROM (SELECT id FROM public.messages WHERE sender = 'contact' AND created_at >= now() - interval '60 minutes' LIMIT 1000) t")"
assert_eq 'a consulta no formato antigo cortaria em 1000 (a RPC nao)' '1000' "$naive"

# --- Sem agente online: queue_ratio e NULL, nao zero -------------------------
psql_script >/dev/null <<'SQL'
UPDATE public.agent_presence SET status = 'offline';
SQL
assert_eq 'sem agente online: online_agents' '0' \
  "$(call_as "$admin_user" "public.crisis_room_snapshot()->>'online_agents'")"
assert_eq 'sem agente online: queue_ratio e NULL (nao 0)' 't' \
  "$(call_as "$admin_user" "(public.crisis_room_snapshot()->>'queue_ratio') IS NULL")"

# --- Autorizacao: quem nao e admin/supervisor recebe excecao, nunca zeros ----
set +e
agent_out="$(call_as "$agent_user" "public.crisis_room_snapshot()" 2>&1)"
agent_status=$?
set -e
assert_denied 'agente comum negado' "$agent_out" "$agent_status" 'requires admin or supervisor'

call_as_role anon anon_out anon_status
assert_denied 'anon negado (sem EXECUTE)' "$anon_out" "$anon_status" 'permission denied'

call_as_role service_role svc_out svc_status
assert_denied 'service_role negado (sem EXECUTE)' "$svc_out" "$svc_status" 'permission denied'

assert_eq 'anon sem EXECUTE na funcao' 'f' \
  "$(psql_query "SELECT has_function_privilege('anon', 'public.crisis_room_snapshot()', 'EXECUTE')")"
assert_eq 'service_role sem EXECUTE na funcao' 'f' \
  "$(psql_query "SELECT has_function_privilege('service_role', 'public.crisis_room_snapshot()', 'EXECUTE')")"
assert_eq 'authenticated com EXECUTE na funcao' 't' \
  "$(psql_query "SELECT has_function_privilege('authenticated', 'public.crisis_room_snapshot()', 'EXECUTE')")"

# --- Rollback de verdade: o inverso da migration roda e derruba a funcao -----
psql_script >/dev/null <<< "drop function if exists public.crisis_room_snapshot();"
assert_eq 'apos o rollback a funcao sumiu' '0' \
  "$(psql_query "SELECT count(*) FROM pg_proc WHERE proname = 'crisis_room_snapshot'")"

printf '[OK] Sala de Crise R2-AUTH-036: snapshot medido no banco, sem corte de 1000 e sem zeros falsos (%s cenarios aprovados).\n' "$passed"
