#!/usr/bin/env bash
# N-096 / X142 (parte 1): talkx_campaign_segment_progress em PostgreSQL 17 descartavel.
#
# Campanha com 3 segmentos de fixture (10/10 processados, 4/10, 0/10):
#   done / running / pending, pending_segments=2, total_segments=3, ordem por position.
# Papel real: SET ROLE authenticated + claims (agente comum -> 42501; admin le;
# service_role le; anon sem EXECUTE).
#
# RED→GREEN: com --red o harness NAO aplica a migration e exige que a funcao nao exista
# (a prova do vermelho). Sem flag aplica a migration REAL e prova o verde.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$(grep -rlF 'Marcador interno: talkx_campaign_segment_progress' "$repo_root/supabase/migrations" | grep -v '/_superseded/' | sort | tail -1 || true)"
segments_migration="$repo_root/supabase/migrations/20261002641230_talkx_v4_x057_segmentos.sql"
mode="${1:-green}"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }
[[ -n "$migration" && -f "$migration" ]] || fail 'migration do progresso por segmento nao encontrada'
[[ -f "$segments_migration" ]] || fail 'migration X057 ausente'

cid="talkx-segprog-$RANDOM$RANDOM"
cleanup() { docker rm -f "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
assert_eq() { [[ "$3" == "$2" ]] || fail "$1: esperado '$2', obtido '$3'"; pass "$1 (= $3)"; }
assert_has() { [[ "$3" == *"$2"* ]] || fail "$1: esperado conter '$2', obtido -> $3"; pass "$1"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_segprog_test_only \
  "${TALKX_SEGPROG_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" >/dev/null
ready=false
for _ in $(seq 1 90); do
  n="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$n" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

user_admin='a0000000-0000-0000-0000-000000000001'
user_agent='a0000000-0000-0000-0000-000000000002'
camp='c0000000-0000-0000-0000-000000000001'
seg1='60000000-0000-0000-0000-000000000001'
seg2='60000000-0000-0000-0000-000000000002'
seg3='60000000-0000-0000-0000-000000000003'

psql_exec >/dev/null <<SQL
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) \$\$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$
    SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid AND r.role IN ('admin','supervisor')) \$\$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO anon, authenticated, service_role;

CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 's', status text NOT NULL DEFAULT 'active');
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'c', status text NOT NULL DEFAULT 'draft',
  audience_source text NOT NULL DEFAULT 'contacts',
  segment_id uuid REFERENCES public.talkx_segments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
);
CREATE PUBLICATION supabase_realtime FOR TABLE public.talkx_recipients;

INSERT INTO public.user_roles VALUES ('$user_admin', 'admin');
INSERT INTO public.talkx_segments (id) VALUES ('$seg1'), ('$seg2'), ('$seg3');
INSERT INTO public.talkx_campaigns (id, status) VALUES ('$camp', 'sending');
GRANT SELECT ON public.talkx_campaigns, public.talkx_recipients, public.talkx_segments TO authenticated, service_role;
SQL
psql_exec < "$segments_migration" >/dev/null || fail 'X057 nao aplicou'
# Ordem de envio propositalmente diferente da ordem dos ids: seg3=1, seg1=2, seg2=3.
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position) VALUES
  ('$camp', '$seg3', 1), ('$camp', '$seg1', 2), ('$camp', '$seg2', 3);
-- seg3: 10/10 processados (6 delivered, 2 sent, 1 failed, 1 skipped)
INSERT INTO public.talkx_recipients (campaign_id, segment_id, status)
SELECT '$camp', '$seg3', s FROM unnest(ARRAY['delivered','delivered','delivered','delivered','delivered','delivered','sent','sent','failed','skipped']) s;
-- seg1: 4/10 (2 delivered, 1 sent, 1 failed; 5 pending + 1 sending)
INSERT INTO public.talkx_recipients (campaign_id, segment_id, status)
SELECT '$camp', '$seg1', s FROM unnest(ARRAY['delivered','delivered','sent','failed','pending','pending','pending','pending','pending','sending']) s;
-- seg2: 0/10
INSERT INTO public.talkx_recipients (campaign_id, segment_id, status)
SELECT '$camp', '$seg2', 'pending' FROM generate_series(1,10);
SQL

admin="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"
agent="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_agent';"
svc="SET ROLE service_role; SET request.jwt.claim.role = 'service_role';"
anon="SET ROLE anon; SET request.jwt.claim.role = 'anon';"
cols='position, total, sent, delivered, failed, remaining, percent, status, total_segments, pending_segments'
q="SELECT string_agg(concat_ws('|', $cols), ';' ORDER BY position) FROM public.talkx_campaign_segment_progress('$camp')"

if [[ "$mode" == '--red' ]]; then
  out="$(psql_val "$admin $q")"
  assert_has 'RED: a funcao nao existe antes da migration' 'does not exist' "$out"
  printf '[RED] confirmado: talkx_campaign_segment_progress ausente sem a migration\n'
  exit 0
fi

psql_exec < "$migration" >/dev/null || fail 'migration nao aplicou'
pass "migration aplicada ($(basename "$migration"))"

expected='1|10|8|6|1|0|100.0|done|3|2;2|10|3|2|1|6|40.0|running|3|2;3|10|0|0|0|10|0.0|pending|3|2'
assert_eq '1. 3 segmentos: done/running/pending na ordem de envio, pending_segments=2' "$expected" "$(psql_val "$admin $q")"
assert_eq '1. service_role le o mesmo' "$expected" "$(psql_val "$svc $q")"
assert_has '2. agente comum barrado' 'talkx_admin_required' "$(psql_val "$agent $q")"
assert_has '2. anon sem EXECUTE' 'permission denied' "$(psql_val "$anon $q")"
assert_eq '3. campanha sem segmentos devolve 0 linhas' '0' \
  "$(psql_val "$admin SELECT count(*) FROM public.talkx_campaign_segment_progress('c0000000-0000-0000-0000-0000000000ff')")"
assert_eq '4. PUBLIC sem EXECUTE' 'false' \
  "$(psql_val "SELECT has_function_privilege('anon', 'public.talkx_campaign_segment_progress(uuid)', 'EXECUTE')::text")"
assert_eq '4. search_path fixado' '{"search_path=public, pg_temp"}' \
  "$(psql_val "SELECT proconfig::text FROM pg_proc WHERE oid='public.talkx_campaign_segment_progress(uuid)'::regprocedure")"

# Rollback do cabecalho (linha '--   <sql>' do bloco 'Rollback (SQL executável')
rb="$(grep -m1 '^--   ' "$migration" | sed 's/^--   //')"
psql_exec -c "$rb" >/dev/null || fail 'rollback do cabecalho nao executou'
assert_eq '5. apos o rollback a funcao some' 'false' \
  "$(psql_val "SELECT (to_regprocedure('public.talkx_campaign_segment_progress(uuid)') IS NOT NULL)::text")"
printf '[PASS] talkx_campaign_segment_progress: 3 segmentos, papeis reais, rollback\n'
