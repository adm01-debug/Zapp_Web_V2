#!/usr/bin/env bash
# N-116/X102 (banco): talkx_segment_health - risco, sinais, composicao e sugestoes,
# so agregados. Migrations REAIS num PG 17 descartavel, como authenticated.
# Alpha Moderado/nota/score 100 sem envio; Gamma Baixo (sent=100, 1% bloqueio);
# Epsilon Alto (6% falhas); Nada zeros e nulos via segmento salvo.
# TALKX_SEGMENT_HEALTH_MIGRATION troca a migration (vermelho sem ela).

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
audience_migration="$repo_root/supabase/migrations/20261002391230_talkx_audience_rpc.sql"
migration="${TALKX_SEGMENT_HEALTH_MIGRATION:-$repo_root/supabase/migrations/20261011003010_talkx_segment_health.sql}"
postgres_image="${TALKX_SEGMENT_HEALTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="seghealth-$$"
test_password="seghealth"

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
    docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null || continue
    for _ in $(seq 1 20); do
      docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 && return 0
      sleep 1
    done
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
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text NOT NULL,
company text, tags text[], contact_type text, consent_status text,
visible boolean NOT NULL DEFAULT true, is_lid_legacy boolean NOT NULL DEFAULT false,
deleted_at timestamptz
);
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT _user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE c.id = _contact_id AND (public.is_admin_or_supervisor(_user_id) OR c.visible))
$$;

CREATE TABLE public.talkx_blacklist (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid, phone text,
reason_code text, expires_at timestamptz, removed_at timestamptz,
created_at timestamptz NOT NULL DEFAULT statement_timestamp()
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
('a0000000-0000-0000-0000-000000000004', 'agent', statement_timestamp() - interval '4 days');

INSERT INTO public.contacts (name, phone, company, consent_status)
SELECT 'G' || n, '551193' || lpad(n::text, 7, '0'), 'Gamma', 'granted' FROM generate_series(1, 100) n;

INSERT INTO public.contacts (name, phone, company, consent_status)
SELECT 'E' || n, '551195' || lpad(n::text, 7, '0'), 'Epsilon', 'granted' FROM generate_series(1, 100) n;
INSERT INTO public.messages (contact_id, sender)
SELECT id, 'contact' FROM public.contacts WHERE company IN ('Gamma', 'Epsilon');

INSERT INTO public.talkx_blacklist (contact_id, reason_code)
SELECT id, 'opt_out' FROM public.contacts WHERE phone = '5511930000100';


INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at, replied_at)
SELECT 'c0000000-0000-0000-0000-000000000001', c.id, 'delivered',
       statement_timestamp() - interval '5 days', statement_timestamp() - interval '5 days',
       CASE WHEN row_number() OVER (ORDER BY c.phone) <= 30 THEN statement_timestamp() - interval '4 days' END
  FROM public.contacts c WHERE c.company = 'Gamma';
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
SELECT 'c0000000-0000-0000-0000-000000000003', c.id,
       CASE WHEN row_number() OVER (ORDER BY c.phone) <= 6 THEN 'failed' ELSE 'delivered' END,
       CASE WHEN row_number() OVER (ORDER BY c.phone) <= 6 THEN NULL ELSE statement_timestamp() - interval '5 days' END,
       CASE WHEN row_number() OVER (ORDER BY c.phone) <= 6 THEN NULL ELSE statement_timestamp() - interval '5 days' END
  FROM public.contacts c WHERE c.company = 'Epsilon';

INSERT INTO public.talkx_segments (id, name, rules, created_by)
SELECT ('40000000-0000-0000-0000-00000000000' || sfx)::uuid, nm,
('{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"' || nm || '"}]}]}')::jsonb,
'10000000-0000-0000-0000-000000000003'
FROM (VALUES ('a','Alpha'),('c','Gamma'),('e','Epsilon'),('f','Nada')) v(sfx, nm);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts, public.talkx_segments TO authenticated, service_role;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test >/dev/null < "$audience_migration"
psql_test >/dev/null < "$migration" || fail "migration de saude nao aplica: $migration"
psql_test >/dev/null < "$migration"

admin_session="SET ROLE authenticated; SET request.jwt.claim.sub='$admin_uid';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.sub='$agent_uid';"
seg() { printf '40000000-0000-0000-0000-00000000000%s' "$1"; }
alpha_rules='{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Alpha"}]}]}'

field() { psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg "$1")'::uuid) #>> '{$2}';"; }
expect() {
  local label="$1" letter="$2" path="$3" want="$4" got
  got="$(field "$letter" "$path")"
  [[ "$got" == "$want" ]] || fail "$label: $path='$got' (queria '$want')"
}

[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.talkx_segment_health(jsonb,uuid)', 'EXECUTE')")" == 'f' ]] || fail 'anon com EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_segment_health(jsonb,uuid)', 'EXECUTE')")" == 't' ]] || fail 'authenticated sem EXECUTE'

for kv in matched=5 eligible=4 suppressed=1 warm=4 inactive_180d=1 no_consent=2 composition,pessoas=2 composition,empresas=1 composition,nao_informado=1 top_tags,0,tag=lead top_tags,0,count=2 top_tags,1,tag=vip level=moderado note=sem_historico_de_envio score=100 signals,qualified_base=true; do
  expect 'Alpha' a "${kv%%=*}" "${kv##*=}"
done
for q in sent delivered replied failed optout; do
  expect 'Alpha' a "last_90d,$q" 0
done
[[ -z "$(field a signals,low_block)" ]] || fail 'Alpha: sinal 2 deveria ser nulo'
[[ -z "$(field a signals,engagement)" ]] || fail 'Alpha: sinal 3 deveria ser nulo'
codes="$(psql_q "$admin_session SELECT string_agg(s->>'code', ',' ORDER BY s->>'code') FROM jsonb_array_elements(public.talkx_segment_health(NULL, '$(seg a)'::uuid) -> 'suggestions') s;")"
[[ "$codes" == 'add_consent_filter,review_suppressed_origin,split_active_inactive' ]] || fail "Alpha: sugestoes inesperadas [$codes]"

# base 205-2.
expect 'base' a base_total 203

for kv in eligible=99 suppressed=1 last_90d,sent=100 last_90d,delivered=100 last_90d,replied=30 last_90d,failed=0 last_90d,optout=1 signals,qualified_base=true signals,low_block=true signals,engagement=true level=baixo score=99; do
  expect 'Gamma' c "${kv%%=*}" "${kv##*=}"
done

for kv in last_90d,sent=100 last_90d,failed=6 signals,low_block=false level=alto; do
  expect 'Epsilon' e "${kv%%=*}" "${kv##*=}"
done

for kv in matched=0 eligible=0 suppressed=0 warm=0 inactive_180d=0 no_consent=0 composition,pessoas=0 composition,empresas=0 composition,nao_informado=0; do
  expect 'Nada' f "${kv%%=*}" "${kv##*=}"
done
for q in sent delivered replied failed optout; do
  expect 'Nada' f "last_90d,$q" 0
done
for q in level score note signals,qualified_base; do
  [[ -z "$(field f "$q")" ]] || fail "Nada: $q deveria ser nulo"
done
[[ "$(field f top_tags)" == '[]' ]] || fail 'Nada: top_tags deveria ser []'
[[ "$(field f suggestions)" == '[]' ]] || fail 'Nada: suggestions deveria ser []'


by_rules="$(psql_q "$admin_session SELECT public.talkx_segment_health('$alpha_rules'::jsonb, NULL);")"
by_segment="$(psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);")"
[[ "$by_rules" == "$by_segment" ]] || fail 'p_rules e p_segment_id deveriam dar o mesmo resultado'

both="$(psql_q "$admin_session SELECT public.talkx_segment_health('$alpha_rules'::jsonb, '$(seg a)'::uuid);")"
[[ "$both" == "$by_segment" ]] || fail 'com os dois parametros, p_rules deveria vencer'
expect_error 'p_rules com segmento inexistente -> P0002' 'talkx_segment_not_found' 'P0002' \
  "$admin_session SELECT public.talkx_segment_health('$alpha_rules'::jsonb, '99999999-0000-0000-0000-000000000000'::uuid);"


[[ "$(psql_q "$admin_session SELECT jsonb_path_exists(public.talkx_segment_health(NULL, '$(seg a)'::uuid), '\$.**.phone') OR jsonb_path_exists(public.talkx_segment_health(NULL, '$(seg a)'::uuid), '\$.**.name');")" == 'f' ]] || fail 'resposta expoe phone/name'


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


psql_q "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);" >/dev/null
psql_test -c "drop function if exists public.talkx_segment_health(jsonb, uuid);" >/dev/null
[[ "$(psql_q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'talkx_segment_health';")" == '0' ]] || fail 'rollback nao removeu a funcao'
set +e
rb_out="$(psql_test -c "$admin_session SELECT public.talkx_segment_health(NULL, '$(seg a)'::uuid);" 2>&1)"
rb_status=$?
set -e
(( rb_status != 0 )) || { printf '%s\n' "$rb_out" >&2; fail 'rollback: funcao ainda executa'; }

printf 'PASS: N-116 talkx_segment_health — risco, sinais, composicao, lista vazia e recusas\n'
