#!/usr/bin/env bash
# X016 (Fase 2 · Tela 03/08/09 · banco): RPC unica de audiencia (talkx_resolve_audience)
# com a funcao interna talkx_audience_query — whitelist de campo/operador, elegibilidade,
# supressao e paginacao keyset. Fecha CAP-003/004/028/029/094/103.
#
# Contrato num PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-role-gates.test.sh, scripts/db-audit/talkx-campaign-worker-lease.test.sh).
#
# Prova, contra a MIGRATION REAL do repo (20261002391230), sobre um schema minimo com as
# colunas que as RPCs tocam e uma fixture de 12 contatos:
#   (a) count: matched=12, eligible=6, suppressed=2, invalid_phone=1, legacy_or_deleted=3;
#   (b) page com limite 4 percorre os 6 elegiveis em 2 paginas, sem repeticao;
#   (c) 10 casos de regra -> ids esperados, cobrindo os 12 operadores da whitelist
#       (eq, neq, contains/not_contains de texto e de array, is_set, is_empty, gt, gte,
#       lt, lte, in_last_days, not_in_last_days) + casos extras de uuid eq e number eq;
#   (d) operador/campo fora da whitelist -> 22023; modo invalido -> 22023;
#   (e) agente (authenticated sem papel) -> 42501; anon sem EXECUTE;
#   (f) a funcao interna respeita p_respect_suppression e a uniao por p_segment_ids.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261002391230_talkx_audience_rpc.sql"
postgres_image="${TALKX_AUDIENCE_RPC_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-audience-rpc-test-$$"
test_password="talkx_audience_rpc_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# Espera o erro de contrato trazendo o SQLSTATE (psql -v VERBOSITY=verbose imprime
# "ERROR:  <code>: <mensagem>") e o texto do RAISE.
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
  # GitHub-hosted runners can occasionally report PostgreSQL ready one instant
  # before its container restarts. Require two successful probes and retry only
  # the disposable bootstrap; a SQL/assertion failure is never retried.
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
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

agent_uid='20000000-0000-0000-0000-000000000003'
admin_uid='20000000-0000-0000-0000-000000000001'
supervisor_uid='20000000-0000-0000-0000-000000000002'
assigned_a='a0000000-0000-0000-0000-00000000000a'

c01='30000000-0000-0000-0000-000000000001'
c02='30000000-0000-0000-0000-000000000002'
c03='30000000-0000-0000-0000-000000000003'
c04='30000000-0000-0000-0000-000000000004'
c05='30000000-0000-0000-0000-000000000005'
c06='30000000-0000-0000-0000-000000000006'
c11='30000000-0000-0000-0000-000000000011'
c12='30000000-0000-0000-0000-000000000012'
seg_acme='40000000-0000-0000-0000-0000000000c1'
seg_beta='40000000-0000-0000-0000-0000000000c2'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
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
  SELECT _user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.contacts c
       WHERE c.id = _contact_id
         AND (public.is_admin_or_supervisor(_user_id) OR c.visible)
     )
$$;

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  origin text NOT NULL DEFAULT 'manual',
  expires_at timestamptz,
  removed_at timestamptz
);

CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

-- Fixture: 6 elegiveis (c01..c06), 2 excluidos (c07,c08), 1 LID (c09),
-- 1 telefone invalido (c10), 2 suprimidos (c11 por id, c12 por telefone formatado).
INSERT INTO public.contacts
  (id, name, phone, company, city, state, email, tags, assigned_to, contact_type,
   channel_type, lead_origin, consent_status, lead_score, risk_score, ai_priority,
   ai_sentiment, group_category, is_lid_legacy, deleted_at, created_at, updated_at, visible) VALUES
  -- elegiveis
  ('30000000-0000-0000-0000-000000000001', 'Ana',  '5511900000001', 'Acme',  'Sao Paulo', 'SP',
   'ana@acme.com', '{vip,lead}', 'a0000000-0000-0000-0000-00000000000a', 'cliente',
   'whatsapp', 'site', 'granted', 10, 5, 'high', 'positivo', 'clientes', false, NULL,
   statement_timestamp() - interval '30 days', statement_timestamp() - interval '5 days', true),
  ('30000000-0000-0000-0000-000000000002', 'Bruno','5511900000002', 'Beta',  'Rio', 'RJ',
   'b@beta.com', '{lead}', NULL, 'prospect',
   'whatsapp', 'site', 'unknown', 80, 30, 'low', 'negativo', 'prospects', false, NULL,
   statement_timestamp() - interval '200 days', statement_timestamp() - interval '100 days', true),
  ('30000000-0000-0000-0000-000000000003', 'Carla','5511900000003', 'Acme',  'Sao Paulo', 'SP',
   'carla@acme.com', '{lead,vip}', NULL, 'cliente',
   'whatsapp', 'site', 'granted', 50, 20, 'high', 'positivo', 'clientes', false, NULL,
   statement_timestamp() - interval '10 days', statement_timestamp() - interval '1 days', true),
  ('30000000-0000-0000-0000-000000000004', 'Duda', '5511900000004', 'Gamma', 'Curitiba', 'PR',
   NULL, NULL, NULL, 'prospect',
   'whatsapp', 'site', 'unknown', NULL, NULL, 'low', 'neutro', 'prospects', false, NULL,
   statement_timestamp() - interval '15 days', statement_timestamp() - interval '10 days', true),
  ('30000000-0000-0000-0000-000000000005', 'Edu',  '5511900000005', 'Delta', 'Salvador', 'BA',
   NULL, '{vip}', NULL, 'cliente',
   'whatsapp', 'site', 'granted', 20, 10, 'high', 'positivo', 'clientes', false, NULL,
   statement_timestamp() - interval '400 days', statement_timestamp() - interval '200 days', true),
  ('30000000-0000-0000-0000-000000000006', 'Fabio','5511900000006', 'Acme',  'Recife', 'PE',
   NULL, '{lead}', NULL, 'prospect',
   'whatsapp', 'site', 'unknown', 65, 25, 'high', 'neutro', 'prospects', false, NULL,
   statement_timestamp() - interval '8 days', statement_timestamp() - interval '3 days', true),
  -- excluidos (deleted_at)
  ('30000000-0000-0000-0000-000000000007', 'Gil',  '5511900000007', 'Acme', 'Sao Paulo', 'SP',
   NULL, NULL, NULL, 'cliente', 'whatsapp', 'site', 'granted', 10, 5, 'high', 'positivo', 'clientes',
   false, statement_timestamp() - interval '2 days', statement_timestamp() - interval '40 days',
   statement_timestamp() - interval '2 days', true),
  ('30000000-0000-0000-0000-000000000008', 'Hugo', '5511900000008', 'Beta', 'Rio', 'RJ',
   NULL, NULL, NULL, 'prospect', 'whatsapp', 'site', 'unknown', 40, 15, 'low', 'neutro', 'prospects',
   false, statement_timestamp() - interval '1 days', statement_timestamp() - interval '40 days',
   statement_timestamp() - interval '1 days', true),
  -- LID legado
  ('30000000-0000-0000-0000-000000000009', 'Ivo',  '5511900000009', 'Acme', 'Sao Paulo', 'SP',
   NULL, NULL, NULL, 'cliente', 'whatsapp', 'site', 'granted', 10, 5, 'high', 'positivo', 'clientes',
   true, NULL, statement_timestamp() - interval '40 days', statement_timestamp() - interval '4 days', true),
  -- telefone invalido
  ('30000000-0000-0000-0000-000000000010', 'Joana','1199ABC', 'Acme', 'Sao Paulo', 'SP',
   NULL, NULL, NULL, 'cliente', 'whatsapp', 'site', 'granted', 10, 5, 'high', 'positivo', 'clientes',
   false, NULL, statement_timestamp() - interval '40 days', statement_timestamp() - interval '4 days', true),
  -- suprimido por contact_id
  ('30000000-0000-0000-0000-000000000011', 'Kleber','5511900000011', 'Acme', 'Sao Paulo', 'SP',
   NULL, NULL, NULL, 'cliente', 'whatsapp', 'site', 'granted', 10, 5, 'high', 'positivo', 'clientes',
   false, NULL, statement_timestamp() - interval '40 days', statement_timestamp() - interval '4 days', true),
  -- suprimido por telefone (formatado na blacklist)
  ('30000000-0000-0000-0000-000000000012', 'Lia', '5511988887777', 'Acme', 'Sao Paulo', 'SP',
   NULL, NULL, NULL, 'cliente', 'whatsapp', 'site', 'granted', 10, 5, 'high', 'positivo', 'clientes',
   false, NULL, statement_timestamp() - interval '40 days', statement_timestamp() - interval '4 days', true);

-- Supressoes: ativa por id (c11), ativa por telefone formatado (c12),
-- EXPIRADA (c05 -> nao conta) e REMOVIDA (c04 -> nao conta).
INSERT INTO public.talkx_blacklist (contact_id, phone, reason, origin, expires_at, removed_at) VALUES
  ('30000000-0000-0000-0000-000000000011', NULL, 'opt-out', 'optout', NULL, NULL),
  (NULL, '+55 (11) 98888-7777', 'opt-out', 'optout', NULL, NULL),
  ('30000000-0000-0000-0000-000000000005', NULL, 'expira', 'list', statement_timestamp() - interval '1 day', NULL),
  ('30000000-0000-0000-0000-000000000004', NULL, 'removida', 'manual', NULL, statement_timestamp() - interval '1 hour');

INSERT INTO public.talkx_segments (id, name, rules, created_by) VALUES
  ('40000000-0000-0000-0000-0000000000c1', 'Acme',
   '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Acme"}]}]}'::jsonb,
   '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000c2', 'Beta',
   '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Beta"}]}]}'::jsonb,
   '10000000-0000-0000-0000-000000000001');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts TO authenticated, service_role;
GRANT SELECT ON public.talkx_segments TO authenticated, service_role;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test < "$migration" >/dev/null
# Replayavel: uma segunda aplicacao nao pode falhar.
psql_test < "$migration" >/dev/null
pass 'migration X016 aplica e e replayavel'

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"
supervisor_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$supervisor_uid';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$agent_uid';"

# ---------------------------------------------------------------------------
# ACL: anon sem EXECUTE na RPC; authenticated com EXECUTE; a funcao interna e
# interna (nem authenticated pode chamar direto).
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.talkx_resolve_audience(jsonb,uuid[],text,integer,uuid)', 'EXECUTE')")" == 'f' ]] || fail 'anon com EXECUTE em talkx_resolve_audience'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_resolve_audience(jsonb,uuid[],text,integer,uuid)', 'EXECUTE')")" == 't' ]] || fail 'authenticated sem EXECUTE em talkx_resolve_audience'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_audience_query(jsonb,uuid[],boolean)', 'EXECUTE')")" == 'f' ]] || fail 'authenticated com EXECUTE na funcao interna talkx_audience_query'
pass 'ACL: anon sem EXECUTE, authenticated com EXECUTE na RPC e sem EXECUTE na funcao interna'

# ---------------------------------------------------------------------------
# (a) count da fixture.
# ---------------------------------------------------------------------------
count_json="$(psql_q "$admin_session SELECT public.talkx_resolve_audience(NULL, NULL, 'count', NULL, NULL);")"
for pair in 'matched=12' 'eligible=6' 'suppressed=2' 'invalid_phone=1' 'legacy_or_deleted=3'; do
  key="${pair%%=*}"; want="${pair##*=}"
  got="$(psql_q "$admin_session SELECT (public.talkx_resolve_audience(NULL, NULL, 'count', NULL, NULL) ->> '$key')::bigint;")"
  [[ "$got" == "$want" ]] || fail "(a) count.$key deveria ser $want [obtido: $got | $count_json]"
done
pass '(a) count: matched=12, eligible=6, suppressed=2, invalid_phone=1, legacy_or_deleted=3'

# supervisor enxerga a mesma contagem.
supervisor_count="$(psql_q "$supervisor_session SELECT public.talkx_resolve_audience(NULL, NULL, 'count', NULL, NULL) ->> 'eligible';")"
[[ "$supervisor_count" == '6' ]] || fail "(a) supervisor: eligible deveria ser 6 [obtido: $supervisor_count]"
pass '(a) supervisor tambem resolve a audiencia (eligible=6)'

# ---------------------------------------------------------------------------
# (b) page com limite 4 percorre os 6 elegiveis em 2 paginas, sem repeticao.
# ---------------------------------------------------------------------------
page1="$(psql_q "$admin_session SELECT string_agg(r->>'id', ',' ORDER BY r->>'id') FROM (SELECT jsonb_array_elements(public.talkx_resolve_audience(NULL, NULL, 'page', 4, NULL) -> 'rows') AS r) x;")"
page1_len="$(psql_q "$admin_session SELECT jsonb_array_length(public.talkx_resolve_audience(NULL, NULL, 'page', 4, NULL) -> 'rows');")"
[[ "$page1_len" == '4' ]] || fail "(b) primeira pagina deveria ter 4 linhas [obtido: $page1_len]"
after="$(psql_q "$admin_session SELECT (public.talkx_resolve_audience(NULL, NULL, 'page', 4, NULL) ->> 'next_after');")"
[[ "$after" == "$c04" ]] || fail "(b) next_after deveria ser $c04 [obtido: $after]"
page2="$(psql_q "$admin_session SELECT string_agg(r->>'id', ',' ORDER BY r->>'id') FROM (SELECT jsonb_array_elements(public.talkx_resolve_audience(NULL, NULL, 'page', 4, '$after'::uuid) -> 'rows') AS r) x;")"
page2_len="$(psql_q "$admin_session SELECT jsonb_array_length(public.talkx_resolve_audience(NULL, NULL, 'page', 4, '$after'::uuid) -> 'rows');")"
[[ "$page2_len" == '2' ]] || fail "(b) segunda pagina deveria ter 2 linhas [obtido: $page2_len]"
expected_page1="$c01,$c02,$c03,$c04"
expected_page2="$c05,$c06"
[[ "$page1" == "$expected_page1" ]] || fail "(b) pagina 1 inesperada [obtido: $page1]"
[[ "$page2" == "$expected_page2" ]] || fail "(b) pagina 2 inesperada [obtido: $page2]"
# A prova de nao-repeticao e a particao exata: cada pagina e um conjunto de ids
# distinto e a uniao cobre os 6 elegiveis (page1 ^ page2 vazio).
for id in ${page1//,/ }; do [[ ",$page2," != *",$id,"* ]] || fail "(b) id $id repetiu entre as paginas"; done
pass '(b) page limite 4: 2 paginas (c01..c04 / c05..c06) cobrem os 6 sem repeticao'

# ---------------------------------------------------------------------------
# (c) 10 casos de regra -> ids esperados (cobrindo cada operador da whitelist).
# ---------------------------------------------------------------------------
page_ids() {
  # $1 = regras jsonb; devolve ids ordenados da pagina de audiencia.
  psql_q "$admin_session SELECT COALESCE(string_agg(r->>'id', ',' ORDER BY r->>'id'), '') FROM (SELECT jsonb_array_elements(public.talkx_resolve_audience('$1'::jsonb, NULL, 'page', 100, NULL) -> 'rows') AS r) x;"
}

check_rule_case() {
  local label="$1" rules="$2" want="$3" got
  got="$(page_ids "$rules")"
  [[ "$got" == "$want" ]] || fail "(c) $label: ids inesperados [obtido: $got | esperado: $want]"
  pass "(c) regra $label -> $want"
}

check_rule_case "eq/texto (company eq Acme)" \
  '{"groups":[{"match":"and","rules":[{"field":"company","op":"eq","value":"Acme"}]}]}' \
  "$c01,$c03,$c06"
check_rule_case "neq/texto (company neq Acme)" \
  '{"groups":[{"match":"and","rules":[{"field":"company","op":"neq","value":"Acme"}]}]}' \
  "$c02,$c04,$c05"
check_rule_case "contains/texto (city contains Paulo)" \
  '{"groups":[{"match":"and","rules":[{"field":"city","op":"contains","value":"Paulo"}]}]}' \
  "$c01,$c03"
check_rule_case "not_contains/texto (company not_contains ta)" \
  '{"groups":[{"match":"and","rules":[{"field":"company","op":"not_contains","value":"ta"}]}]}' \
  "$c01,$c03,$c04,$c06"
check_rule_case "is_set (email preenchido)" \
  '{"groups":[{"match":"and","rules":[{"field":"email","op":"is_set","value":""}]}]}' \
  "$c01,$c02,$c03"
check_rule_case "is_empty (email vazio)" \
  '{"groups":[{"match":"and","rules":[{"field":"email","op":"is_empty","value":""}]}]}' \
  "$c04,$c05,$c06"
check_rule_case "contains+not_contains/array (tags vip e sem lead)" \
  '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"vip"},{"field":"tags","op":"not_contains","value":"lead"}]}]}' \
  "$c05"
check_rule_case "gt+gte/numero (score >50 e >=65)" \
  '{"groups":[{"match":"and","rules":[{"field":"lead_score","op":"gt","value":"50"},{"field":"lead_score","op":"gte","value":"65"}]}]}' \
  "$c02,$c06"
check_rule_case "lt+lte/numero (score <50 e <=20)" \
  '{"groups":[{"match":"and","rules":[{"field":"lead_score","op":"lt","value":"50"},{"field":"lead_score","op":"lte","value":"20"}]}]}' \
  "$c01,$c05"
check_rule_case "in_last_days|not_in_last_days (7d OU >30d)" \
  '{"groups":[{"match":"and","rules":[{"field":"updated_at","op":"in_last_days","value":"7"}]},{"match":"and","rules":[{"field":"updated_at","op":"not_in_last_days","value":"30"}]}]}' \
  "$c01,$c02,$c03,$c05,$c06"

# Casos extras de tipo: uuid eq e number eq (mesmo codigo de eq).
check_rule_case "eq/uuid (assigned_to)" \
  "{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"assigned_to\",\"op\":\"eq\",\"value\":\"$assigned_a\"}]}]}" \
  "$c01"
check_rule_case "eq/numero (lead_score eq 80)" \
  '{"groups":[{"match":"and","rules":[{"field":"lead_score","op":"eq","value":"80"}]}]}' \
  "$c02"
check_rule_case "eq/enum (group_category eq clientes)" \
  '{"groups":[{"match":"and","rules":[{"field":"group_category","op":"eq","value":"clientes"}]}]}' \
  "$c01,$c03,$c05"

# ---------------------------------------------------------------------------
# (d) campo/operador fora da whitelist -> 22023; modo invalido -> 22023.
# ---------------------------------------------------------------------------
expect_error '(d) operador fora da whitelist -> 22023' 'invalid_talkx_audience_operator' '22023' \
  "$admin_session SELECT public.talkx_resolve_audience('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"company\",\"op\":\"like\",\"value\":\"x\"}]}]}'::jsonb, NULL, 'count', NULL, NULL);"
expect_error '(d) campo fora da whitelist -> 22023' 'invalid_talkx_audience_field' '22023' \
  "$admin_session SELECT public.talkx_resolve_audience('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"phone\",\"op\":\"eq\",\"value\":\"x\"}]}]}'::jsonb, NULL, 'count', NULL, NULL);"
expect_error '(d) operador valido de outro kind -> 22023' 'invalid_talkx_audience_operator' '22023' \
  "$admin_session SELECT public.talkx_resolve_audience('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"gt\",\"value\":\"1\"}]}]}'::jsonb, NULL, 'count', NULL, NULL);"
expect_error '(d) modo invalido -> 22023' 'invalid_talkx_audience_mode' '22023' \
  "$admin_session SELECT public.talkx_resolve_audience(NULL, NULL, 'download', NULL, NULL);"

# ---------------------------------------------------------------------------
# (e) agente (authenticated sem papel) -> 42501.
# ---------------------------------------------------------------------------
expect_error '(e) agente -> 42501' 'talkx_audience_role_required' '42501' \
  "$agent_session SELECT public.talkx_resolve_audience(NULL, NULL, 'count', NULL, NULL);"

# ---------------------------------------------------------------------------
# (f) funcao interna: p_respect_suppression=false reinclui os 2 suprimidos; e a
#     uniao por p_segment_ids.
# ---------------------------------------------------------------------------
internal_off="$(psql_q "SET request.jwt.claim.sub='$admin_uid'; SELECT count(*) FROM public.talkx_audience_query(NULL, NULL, false) q WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed;")"
[[ "$internal_off" == '8' ]] || fail "(f) sem respeitar supressao deveriam sobrar 8 elegiveis [obtido: $internal_off]"
internal_on="$(psql_q "SET request.jwt.claim.sub='$admin_uid'; SELECT count(*) FROM public.talkx_audience_query(NULL, NULL, true) q WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed;")"
[[ "$internal_on" == '6' ]] || fail "(f) respeitando supressao deveriam sobrar 6 elegiveis [obtido: $internal_on]"
pass '(f) talkx_audience_query: p_respect_suppression=false -> 8, true -> 6'

segment_union="$(psql_q "$admin_session SELECT string_agg(r->>'id', ',' ORDER BY r->>'id') FROM (SELECT jsonb_array_elements(public.talkx_resolve_audience(NULL, ARRAY['$seg_acme'::uuid, '$seg_beta'::uuid], 'page', 100, NULL) -> 'rows') AS r) x;")"
[[ "$segment_union" == "$c01,$c02,$c03,$c06" ]] || fail "(f) uniao por segmentos inesperada [obtido: $segment_union]"
pass '(f) p_segment_ids une as regras dos segmentos salvos (Acme + Beta -> c01,c02,c03,c06)'

printf 'PASS: X016 audience RPC — elegibilidade, supressao, paginacao keyset, whitelist de regras e gate de papel\n'
