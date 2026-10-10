#!/usr/bin/env bash
# N-116 / X102 (Talk X · banco): RPC talkx_segment_health — risco de entrega, sinais,
# composicao e sugestoes de um segmento, so com agregados.
#
# Contrato num PostgreSQL 17 descartavel, no mesmo formato de talkx-audience-rpc.test.sh.
# Aplica as migrations REAIS do repo (audiencia 20261002391230 + saude 20261011003010) sobre
# um schema minimo e roda a RPC com papel real (SET ROLE authenticated + claims).
#
# Fixture (empresa -> cenario):
#   Alpha   4 elegiveis quentes + 1 suprimido, sem historico de envio -> Moderado, nota
#           sem_historico_de_envio, score 100 (bloqueio entra como zero), sinais 2/3 nulos,
#           sugestoes dividir/consentimento/revisar;
#   Beta    10 elegiveis, 3 quentes (30%) -> Alto;
#   Gamma   99 elegiveis quentes + 1 opt-out suprimido, 100 envios, 1 descadastro (1%),
#           30 respostas em 100 entregues (> media do modulo) -> Baixo;
#   Delta   99 elegiveis quentes, 99 envios -> sinais 2/3 nulos, nivel Moderado;
#   Epsilon 100 elegiveis quentes, 100 envios com 6 falhas (6%) -> Alto;
#   Nada    nenhum contato -> eligible 0, last_90d/composition zerados (nunca nulos),
#           nivel, score e note nulos, sem excecao (via p_segment_id salvo E via p_rules livre).
# Variavel de teste: TALKX_SEGMENT_HEALTH_MIGRATION aponta para outra migration (usada para
# provar que o teste fica vermelho sem a correcao).

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
audience_migration="$repo_root/supabase/migrations/20261002391230_talkx_audience_rpc.sql"
migration="${TALKX_SEGMENT_HEALTH_MIGRATION:-$repo_root/supabase/migrations/20261011003010_talkx_segment_health.sql}"
postgres_image="${TALKX_SEGMENT_HEALTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-segment-health-test-$$"
test_password="talkx_segment_health_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

expect_error() {
  local label="$1" message="$2" errcode="$3" sql="$4" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  [[ "$out" == *"$errcode"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o SQLSTATE '$errcode'"; }
  pass "$label"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

admin_uid='20000000-0000-0000-0000-000000000001'
agent_uid='20000000-0000-0000-0000-000000000003'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  phone text NOT NULL,
  company text,
  city text,
  state text,
  email text,
  tags text[],
  assigned_to uuid,
  contact_type text,
  conversation_status text NOT NULL DEFAULT 'open',
  channel_type text,
  lead_origin text,
  consent_status text,
  lead_score integer,
  risk_score integer,
  ai_priority text,
  ai_sentiment text,
  group_category text,
  avatar_url text,
  visible boolean NOT NULL DEFAULT true,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = _contact_id AND (public.is_admin_or_supervisor(_user_id) OR c.visible))
$$;

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  reason_code text,
  origin text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz,
  removed_at timestamptz
);
CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by uuid
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sender text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (campaign_id, contact_id)
);

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES ('20000000-0000-0000-0000-000000000001', 'admin');

-- Alpha: a1..a4 elegiveis, a5 suprimido. Telefone 13 digitos.
INSERT INTO public.contacts (id, name, phone, company, tags, contact_type, consent_status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'A1', '5511900000001', 'Alpha', '{vip,lead}', 'cliente', 'granted'),
  ('a0000000-0000-0000-0000-000000000002', 'A2', '5511900000002', 'Alpha', '{lead}', 'empresa', 'granted'),
  ('a0000000-0000-0000-0000-000000000003', 'A3', '5511900000003', 'Alpha', '{vip}', 'cliente', 'unknown'),
  ('a0000000-0000-0000-0000-000000000004', 'A4', '5511900000004', 'Alpha', NULL, NULL, 'unknown'),
  ('a0000000-0000-0000-0000-000000000005', 'A5', '5511900000005', 'Alpha', NULL, 'cliente', 'granted');
INSERT INTO public.talkx_blacklist (contact_id, reason_code) VALUES ('a0000000-0000-0000-0000-000000000005', 'manual');
INSERT INTO public.messages (contact_id, sender, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'contact', statement_timestamp() - interval '10 days'),
  ('a0000000-0000-0000-0000-000000000002', 'contact', statement_timestamp() - interval '10 days'),
  ('a0000000-0000-0000-0000-000000000003', 'contact', statement_timestamp() - interval '200 days'),
  ('a0000000-0000-0000-0000-000000000004', 'contact', statement_timestamp() - interval '5 days'),
  ('a0000000-0000-0000-0000-000000000004', 'agent',   statement_timestamp() - interval '4 days');

-- Beta: 10 elegiveis, 3 quentes.
INSERT INTO public.contacts (name, phone, company)
  SELECT 'B' || n, '551192' || lpad(n::text, 7, '0'), 'Beta' FROM generate_series(1, 10) n;
INSERT INTO public.messages (contact_id, sender)
  SELECT id, 'contact' FROM public.contacts WHERE company = 'Beta' ORDER BY phone LIMIT 3;

-- Gamma: 100 contatos quentes; o ultimo (g100) e opt-out ativo (suprimido).
INSERT INTO public.contacts (name, phone, company, consent_status)
  SELECT 'G' || n, '551193' || lpad(n::text, 7, '0'), 'Gamma', 'granted' FROM generate_series(1, 100) n;
-- Delta: 99 quentes. Epsilon: 100 quentes.
INSERT INTO public.contacts (name, phone, company, consent_status)
  SELECT 'D' || n, '551194' || lpad(n::text, 7, '0'), 'Delta', 'granted' FROM generate_series(1, 99) n;
INSERT INTO public.contacts (name, phone, company, consent_status)
  SELECT 'E' || n, '551195' || lpad(n::text, 7, '0'), 'Epsilon', 'granted' FROM generate_series(1, 100) n;
INSERT INTO public.messages (contact_id, sender)
  SELECT id, 'contact' FROM public.contacts WHERE company IN ('Gamma', 'Delta', 'Epsilon');

INSERT INTO public.talkx_blacklist (contact_id, reason_code)
  SELECT id, 'opt_out' FROM public.contacts WHERE phone = '5511930000100';

-- Envios (campanha unica por empresa).
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at, replied_at)
  SELECT 'c0000000-0000-0000-0000-000000000001', c.id, 'delivered',
         statement_timestamp() - interval '5 days', statement_timestamp() - interval '5 days',
         CASE WHEN row_number() OVER (ORDER BY c.phone) <= 30 THEN statement_timestamp() - interval '4 days' END
    FROM public.contacts c WHERE c.company = 'Gamma';
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
  SELECT 'c0000000-0000-0000-0000-000000000002', c.id, 'delivered',
         statement_timestamp() - interval '5 days', statement_timestamp() - interval '5 days'
    FROM public.contacts c WHERE c.company = 'Delta';
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
  SELECT 'c0000000-0000-0000-0000-000000000003', c.id,
         CASE WHEN row_number() OVER (ORDER BY c.phone) <= 6 THEN 'failed' ELSE 'delivered' END,
         CASE WHEN row_number() OVER (ORDER BY c.phone) <= 6 THEN NULL ELSE statement_timestamp() - interval '5 days' END,
         CASE WHEN row_number() OVER (ORDER BY c.phone) <= 6 THEN NULL ELSE statement_timestamp() - interval '5 days' END
    FROM public.contacts c WHERE c.company = 'Epsilon';

INSERT INTO public.talkx_segments (id, name, rules, created_by) VALUES
  ('40000000-0000-0000-0000-00000000000a', 'Alpha', '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Alpha"}]}]}', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-00000000000b', 'Beta',  '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Beta"}]}]}', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-00000000000c', 'Gamma', '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Gamma"}]}]}', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-00000000000d', 'Delta', '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Delta"}]}]}', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-00000000000e', 'Epsilon', '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Epsilon"}]}]}', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-00000000000f', 'Nada',  '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Nada"}]}]}', '10000000-0000-0000-0000-000000000003');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts, public.talkx_segments TO authenticated, service_role;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test >/dev/null < "$audience_migration"
psql_test >/dev/null < "$migration" || fail "migration de saude nao aplica: $migration"
psql_test >/dev/null < "$migration"
pass 'migrations de audiencia e saude aplicam; a de saude e replayavel'

admin_session="SET ROLE authenticated; SET request.jwt.claim.sub='$admin_uid';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.sub='$agent_uid';"
seg() { printf '40000000-0000-0000-0000-00000000000%s' "$1"; }
beta_rules='{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Beta"}]}]}'
nada_rules='{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Nada"}]}]}'

# health <letra> <jq-like path como texto jsonb> -> valor texto
field() { psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg "$1")'::uuid) #>> '{$2}';"; }
expect() {
  local label="$1" letter="$2" path="$3" want="$4" got
  got="$(field "$letter" "$path")"
  [[ "$got" == "$want" ]] || fail "$label: $path esperado '$want' [obtido: '$got']"
}

[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.talkx_segment_health(jsonb,uuid)', 'EXECUTE')")" == 'f' ]] || fail 'anon com EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_segment_health(jsonb,uuid)', 'EXECUTE')")" == 't' ]] || fail 'authenticated sem EXECUTE'
pass 'ACL: anon sem EXECUTE, authenticated com EXECUTE'

# --- Alpha: numeros, composicao, tags, sugestoes, Moderado sem historico ---
for kv in matched=5 eligible=4 suppressed=1 warm=4 inactive_180d=1 no_consent=2; do
  expect 'Alpha' a "${kv%%=*}" "${kv##*=}"
done
expect 'Alpha' a composition,pessoas 2          # a1, a3 (cliente)
expect 'Alpha' a composition,empresas 1         # a2
expect 'Alpha' a composition,nao_informado 1    # a4
expect 'Alpha' a top_tags,0,tag lead
expect 'Alpha' a top_tags,0,count 2
expect 'Alpha' a top_tags,1,tag vip
expect 'Alpha' a last_90d,sent 0
expect 'Alpha' a last_90d,delivered 0
expect 'Alpha' a last_90d,replied 0
expect 'Alpha' a last_90d,failed 0
expect 'Alpha' a last_90d,optout 0
expect 'Alpha' a level moderado
expect 'Alpha' a note sem_historico_de_envio
expect 'Alpha' a score 100   # 100 * 1.0 * (1 - 0): bloqueio entra como zero sem historico
expect 'Alpha' a signals,qualified_base true
[[ -z "$(field a signals,low_block)" ]] || fail 'Alpha: sinal 2 deveria ser nulo'
[[ -z "$(field a signals,engagement)" ]] || fail 'Alpha: sinal 3 deveria ser nulo'
codes="$(psql_q "$admin_session SELECT string_agg(s->>'code', ',' ORDER BY s->>'code') FROM jsonb_array_elements(public.talkx_segment_health(NULL, '$(seg a)'::uuid) -> 'suggestions') s;")"
[[ "$codes" == 'add_consent_filter,review_suppressed_origin,split_active_inactive' ]] || fail "Alpha: sugestoes inesperadas [$codes]"
pass 'Alpha: contagens, composicao, tags, Moderado sem historico, sinais 2/3 nulos e 3 sugestoes'

# base_total = contatos validos nao suprimidos da base inteira (calculo independente).
want_base="$(psql_q "SELECT count(*) FROM public.contacts c WHERE c.deleted_at IS NULL AND NOT c.is_lid_legacy AND c.phone ~ '^[0-9]{10,15}\$' AND NOT EXISTS (SELECT 1 FROM public.talkx_blacklist b WHERE b.contact_id = c.id AND b.removed_at IS NULL);")"
expect 'Alpha' a base_total "$want_base"
pass "base_total = $want_base"

# --- Beta: poucos quentes -> Alto ---
expect 'Beta' b eligible 10
expect 'Beta' b warm 3
expect 'Beta' b level alto
pass 'Beta: warm/eligible 30% -> Alto'

# --- Gamma: tres sinais verdadeiros -> Baixo ---
expect 'Gamma' c eligible 99
expect 'Gamma' c suppressed 1
expect 'Gamma' c last_90d,sent 100
expect 'Gamma' c last_90d,delivered 100
expect 'Gamma' c last_90d,replied 30
expect 'Gamma' c last_90d,failed 0
expect 'Gamma' c last_90d,optout 1
expect 'Gamma' c signals,qualified_base true
expect 'Gamma' c signals,low_block true
expect 'Gamma' c signals,engagement true
expect 'Gamma' c level baixo
expect 'Gamma' c score 99
pass 'Gamma: sent=100, 1% de descadastro, resposta acima da media -> Baixo'

# --- Delta: sent=99 -> sinais 2 e 3 nulos e no maximo Moderado ---
expect 'Delta' d last_90d,sent 99
[[ -z "$(field d signals,low_block)" ]] || fail 'Delta: sinal 2 deveria ser nulo com sent=99'
[[ -z "$(field d signals,engagement)" ]] || fail 'Delta: sinal 3 deveria ser nulo com sent=99'
expect 'Delta' d level moderado
pass 'Delta: sent=99 -> sinais 2/3 nulos, nivel Moderado'

# --- Epsilon: bloqueio 6% -> Alto mesmo com base quente ---
expect 'Epsilon' e last_90d,sent 100
expect 'Epsilon' e last_90d,failed 6
expect 'Epsilon' e signals,low_block false
expect 'Epsilon' e level alto
pass 'Epsilon: falhas 6% -> Alto'

# --- Lista vazia (segmento salvo 'Nada', sem contatos): zera sem estourar ---
expect 'Nada' f eligible 0
expect 'Nada' f matched 0
expect 'Nada' f suppressed 0
expect 'Nada' f warm 0
expect 'Nada' f inactive_180d 0
expect 'Nada' f no_consent 0
expect 'Nada' f last_90d,sent 0
expect 'Nada' f last_90d,delivered 0
expect 'Nada' f last_90d,replied 0
expect 'Nada' f last_90d,failed 0
expect 'Nada' f last_90d,optout 0
expect 'Nada' f composition,pessoas 0
expect 'Nada' f composition,empresas 0
expect 'Nada' f composition,nao_informado 0
[[ -z "$(field f level)" ]] || fail 'Nada: nivel deveria ser nulo'
[[ -z "$(field f score)" ]] || fail 'Nada: score deveria ser nulo'
[[ -z "$(field f note)" ]] || fail 'Nada: note deveria ser nula'
[[ -z "$(field f signals,qualified_base)" ]] || fail 'Nada: sinal 1 deveria ser nulo'
[[ "$(field f top_tags)" == '[]' ]] || fail 'Nada: top_tags deveria ser []'
[[ "$(field f suggestions)" == '[]' ]] || fail 'Nada: suggestions deveria ser []'
pass 'lista vazia via p_segment_id salvo: contadores zerados, nulos onde a regra manda, sem excecao'

# --- Campo livre (so p_rules, sem p_segment_id): entra no conjunto e zera no vazio ---
by_rules="$(psql_q "$admin_session SELECT public.talkx_segment_health('$beta_rules'::jsonb, NULL);")"
by_segment="$(psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg b)'::uuid);")"
[[ "$by_rules" == "$by_segment" ]] || fail 'p_rules e p_segment_id deveriam dar o mesmo resultado'
pass 'p_rules e p_segment_id equivalentes'
free_empty="$(psql_q "$admin_session SELECT public.talkx_segment_health('$nada_rules'::jsonb, NULL) #>> '{eligible}';")"
[[ "$free_empty" == '0' ]] || fail "campo livre vazio: eligible esperado '0' [obtido: '$free_empty']"
free_empty_level="$(psql_q "$admin_session SELECT public.talkx_segment_health('$nada_rules'::jsonb, NULL) #>> '{level}';")"
[[ -z "$free_empty_level" ]] || fail 'campo livre vazio: nivel deveria ser nulo'
pass 'campo livre vazio: eligible 0 e nivel nulo, sem excecao'

# --- Com os dois, p_rules vence mas o segmento ainda precisa existir ---
both="$(psql_q "$admin_session SELECT public.talkx_segment_health('$beta_rules'::jsonb, '$(seg a)'::uuid);")"
[[ "$both" == "$by_segment" ]] || fail 'com os dois parametros, p_rules deveria vencer'
pass 'com os dois parametros, p_rules vence'
expect_error 'p_rules com segmento inexistente -> P0002' 'talkx_segment_not_found' 'P0002' \
  "$admin_session SELECT public.talkx_segment_health('$beta_rules'::jsonb, '99999999-0000-0000-0000-000000000000'::uuid);"

# --- so agregados: nenhuma chave phone/name em lugar nenhum ---
[[ "$(psql_q "$admin_session SELECT jsonb_path_exists(public.talkx_segment_health(NULL, '$(seg a)'::uuid), '\$.**.phone') OR jsonb_path_exists(public.talkx_segment_health(NULL, '$(seg a)'::uuid), '\$.**.name');")" == 'f' ]] || fail 'resposta expoe phone/name'
[[ "$(psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid)::text ~ '5511900000';")" == 'f' ]] || fail 'resposta contem telefone'
pass 'resposta so com agregados (sem phone/name)'

# --- recusas ---
expect_error 'agente -> 42501' 'talkx_segment_health_role_required' '42501' \
  "$agent_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);"
expect_error 'sem sessao -> 42501' 'talkx_segment_health_role_required' '42501' \
  "SET ROLE authenticated; SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);"
expect_error 'segmento inexistente -> P0002' 'talkx_segment_not_found' 'P0002' \
  "$admin_session SELECT public.talkx_segment_health(NULL, '99999999-0000-0000-0000-000000000000'::uuid);"
expect_error 'sem regras e sem segmento -> 22023 citando rules' 'invalid_talkx_segment_health_rules' '22023' \
  "$admin_session SELECT public.talkx_segment_health(NULL, NULL);"
expect_error 'campo fora da whitelist -> 22023' 'invalid_talkx_audience_field' '22023' \
  "$admin_session SELECT public.talkx_segment_health('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"phone\",\"op\":\"eq\",\"value\":\"x\"}]}]}'::jsonb, NULL);"

# --- rollback documentado: desfaz a funcao nova (nada existente foi alterado) ---
psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);" >/dev/null
psql_test -c "drop function if exists public.talkx_segment_health(jsonb, uuid);" >/dev/null
[[ "$(psql_q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'talkx_segment_health';")" == '0' ]] || fail 'rollback nao removeu a funcao'
set +e
rb_out="$(psql_test -c "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);" 2>&1)"
rb_status=$?
set -e
(( rb_status != 0 )) || { printf '%s\n' "$rb_out" >&2; fail 'rollback: funcao ainda executa'; }
pass 'rollback documentado remove a funcao e o estado volta'

printf 'PASS: N-116 talkx_segment_health — risco, sinais, composicao, lista vazia e recusas\n'
