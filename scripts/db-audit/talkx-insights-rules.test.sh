#!/usr/bin/env bash
# N-124/X075: talkx_insights = dicas por regra no servidor (migration REAL num
# Postgres 17 descartavel; caminho feliz como authenticated, nunca postgres).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mig="$repo_root/supabase/migrations/20261011003014_talkx_v4_insights_rules.sql"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

test_password='ti_test_only'
cid="ti-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^ti-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'sem docker'
docker info >/dev/null 2>&1 || fail 'docker inacessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'postgres nao subiu'

# fixtures: o minimo que a funcao le (sem auth.role: nao usa).
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid, template_id uuid, status text NOT NULL DEFAULT 'draft',
  sent_count integer NOT NULL DEFAULT 0, replied_count integer NOT NULL DEFAULT 0,
  created_by uuid, completed_at timestamptz
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL, sent_at timestamptz, replied_at timestamptz
);
CREATE TABLE public.talkx_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL);
CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.is_admin', true), 'false')::boolean
$$;
SQL

# RED: sem a migration a RPC nao existe
S='public.talkx_insights(timestamptz,timestamptz)'
[[ "$(psql_q "select to_regprocedure('$S') is not null")" == 'f' ]] || fail 'RED: funcao ja existia'
red_err="$(psql_test -Atqc "select public.talkx_insights(now() - interval '30 days', now());" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: esperava does not exist (got: $red_err)"

# GREEN: aplica o arquivo REAL
psql_test < "$mig" >/dev/null || fail 'migration nao aplicou'
[[ "$(psql_q "select to_regprocedure('$S') is not null")" == 't' ]] || fail 'GREEN: funcao sumiu'

# A: 5 com-seg T1 (.50) + 4 sem-seg T2 (.10) + 1 a 91d. C: 2 camp (abaixo do min).
# E: 3 com + 3 sem-seg com 0 respostas (regra 2 nao divide por zero). D: vazio.
psql_test >/dev/null <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('50000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-00000000000c', '40000000-0000-0000-0000-00000000000c'),
  ('50000000-0000-0000-0000-00000000000d', '40000000-0000-0000-0000-00000000000d'),
  ('50000000-0000-0000-0000-00000000000e', '40000000-0000-0000-0000-00000000000e');
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, completed_at)
SELECT '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'completed', 100, 50,
       '50000000-0000-0000-0000-00000000000a', now() - interval '1 day' FROM generate_series(1, 5);
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, completed_at)
SELECT NULL, '20000000-0000-0000-0000-000000000002', 'completed', 100, 10,
       '50000000-0000-0000-0000-00000000000a', now() - interval '2 days' FROM generate_series(1, 4);
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, completed_at)
VALUES (NULL, '20000000-0000-0000-0000-000000000002', 'completed', 100, 10,
        '50000000-0000-0000-0000-00000000000a', now() - interval '91 days');
INSERT INTO public.talkx_links (campaign_id)
SELECT id FROM public.talkx_campaigns WHERE created_by = '50000000-0000-0000-0000-00000000000a';
INSERT INTO public.talkx_link_clicks (link_id, clicked_at)
SELECT l.id, now() - interval '1 day' FROM public.talkx_links l
JOIN public.talkx_campaigns c ON c.id = l.campaign_id
WHERE c.created_by = '50000000-0000-0000-0000-00000000000a';
INSERT INTO public.talkx_recipients (campaign_id, sent_at, replied_at)
SELECT c.id,
  (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours') AT TIME ZONE 'America/Sao_Paulo',
  CASE WHEN g <= 60 THEN (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours' + interval '5 minutes') AT TIME ZONE 'America/Sao_Paulo' END
FROM (SELECT id FROM public.talkx_campaigns WHERE created_by = '50000000-0000-0000-0000-00000000000a' AND segment_id IS NOT NULL LIMIT 1) c, generate_series(1, 200) g;
INSERT INTO public.talkx_recipients (campaign_id, sent_at, replied_at)
SELECT c.id,
  (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '20 hours') AT TIME ZONE 'America/Sao_Paulo',
  CASE WHEN g <= 10 THEN (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '20 hours' + interval '5 minutes') AT TIME ZONE 'America/Sao_Paulo' END
FROM (SELECT id FROM public.talkx_campaigns WHERE created_by = '50000000-0000-0000-0000-00000000000a' AND segment_id IS NOT NULL LIMIT 1) c, generate_series(1, 100) g;
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, completed_at)
SELECT NULL, '20000000-0000-0000-0000-000000000003', 'completed', 20, 2,
       '50000000-0000-0000-0000-00000000000c', now() - interval '1 day' FROM generate_series(1, 2);
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, completed_at)
SELECT '10000000-0000-0000-0000-00000000000e', NULL, 'completed', 100, 5,
       '50000000-0000-0000-0000-00000000000e', now() - interval '1 day' FROM generate_series(1, 3);
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, completed_at)
SELECT NULL, NULL, 'completed', 100, 0,
       '50000000-0000-0000-0000-00000000000e', now() - interval '1 day' FROM generate_series(1, 3);
SQL

# 1 chamada por dono; ck confere a linha exata (insights[id].campo).
as_user() { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$1'; SET LOCAL test.is_admin='$2'; $3 COMMIT;" 2>&1 || true; }
A() { as_user '40000000-0000-0000-0000-00000000000a' 'false' "$1"; }
C() { as_user '40000000-0000-0000-0000-00000000000c' 'false' "$1"; }
D() { as_user '40000000-0000-0000-0000-00000000000d' 'false' "$1"; }
E() { as_user '40000000-0000-0000-0000-00000000000e' 'false' "$1"; }
ADM() { as_user '40000000-0000-0000-0000-00000000000a' 'true' "$1"; }
P="public.talkx_insights(now() - interval '95 days', now())"
Q="WITH r AS (SELECT $P AS j), i AS (SELECT e FROM r, jsonb_array_elements(r.j->'insights') e)"
QL="$Q SELECT 'len=' || (SELECT count(*)::text FROM i) UNION ALL SELECT 'rule_count=' || ((SELECT r.j->'summary'->>'rule_count' FROM r)) UNION ALL SELECT 'lift_null=' || ((SELECT (SELECT r.j->'summary'->>'estimated_lift_pct' FROM r) IS NULL)::text) UNION ALL SELECT 'ids=' || (SELECT string_agg(x.e->>'id', ',' ORDER BY x.e->>'id') FROM i x)"
QA="$QL UNION ALL SELECT 'bw=' || (SELECT concat_ws('|', x.e->>'type', x.e->>'priority', x.e->>'action', x.e->'params'->>'hour', x.e->'params'->>'reply_rate_pct', x.e->'params'->>'avg_reply_rate_pct', x.e->'params'->>'lift_pct', x.e->>'sample') FROM i x WHERE x.e->>'id'='best-window') UNION ALL SELECT 'sg=' || (SELECT concat_ws('|', x.e->'params'->>'with_segment_campaigns', x.e->'params'->>'without_segment_campaigns', x.e->>'action') FROM i x WHERE x.e->>'id'='segment-lift') UNION ALL SELECT 'tp=' || (SELECT concat_ws('|', x.e->'params'->>'campaigns', x.e->'params'->>'sent', x.e->>'action') FROM i x WHERE x.e->>'id'='best-template') UNION ALL SELECT 'lk=' || (SELECT concat_ws('|', x.e->'params'->>'low_click_campaigns', x.e->'params'->>'completed_campaigns', x.e->'params'->>'avg_click_rate_pct') FROM i x WHERE x.e->>'id'='low-clicks')"
ck() { printf '%s\n' "$1" | grep -qxF "$2" || fail "$3"; }

out_a="$(A "$QA")"
ck "$out_a" 'ids=best-template,best-window,low-clicks,segment-lift' 'sem as 4 dicas'
ck "$out_a" 'rule_count=4' 'rule_count != 4'
ck "$out_a" 'bw=timing|high|prefill_send_window|10|30.0|23.3|28.6|200' 'best-window'
ck "$out_a" 'sg=5|5|open_segments' 'segment-lift'
ck "$out_a" 'tp=5|500|open_template' 'best-template'
ck "$out_a" 'lk=10|10|1.0' 'low-clicks'
ck "$out_a" 'lift_null=true' 'lift nulo com 9'
psql_test -Atqc "UPDATE public.talkx_campaigns SET completed_at=now()-interval '5 days' WHERE completed_at<now()-interval '90 days';" >/dev/null
ck "$(A "select $P->'summary'->>'estimated_lift_pct';")" '50' 'lift != 50 com 10 em 90d'

out_c="$(C "$QL")"
ck "$out_c" 'len=0' 'C devia ter 0 dicas'; ck "$out_c" 'rule_count=0' 'C rule_count'
ck "$out_c" 'lift_null=true' 'C lift nulo'
out_d="$(D "$QL")"
ck "$out_d" 'len=0' 'D devia ter 0 dicas'; ck "$out_d" 'rule_count=0' 'D rule_count'
ck "$(ADM "$QL")" 'rule_count=4' 'admin devia ver 4'

# regra 2 com 0 respostas no lado sem segmento: nao pode dividir por zero; a
# funcao segue e avalia as outras regras (E tem low-clicks, nao segment-lift)
out_e="$(E "$QL")"
[[ "$out_e" != *'division_by_zero'* ]] || fail 'regra 2 dividiu por zero'
ck "$out_e" 'len=1' 'E devia ter 1 dica'; ck "$out_e" 'rule_count=1' 'E rule_count'
ck "$out_e" 'ids=low-clicks' 'E sem segment-lift'; ck "$out_e" 'lift_null=true' 'E lift nulo'

# periodo invalido
bad_range="$(A "select public.talkx_insights(now(), now() - interval '1 day');")"
[[ "$bad_range" == *'invalid_talkx_insights_period'* ]] || fail "periodo invertido (got: $bad_range)"
bad_null="$(A "select public.talkx_insights(NULL, now());")"
[[ "$bad_null" == *'invalid_talkx_insights_period'* ]] || fail "p_from nulo (got: $bad_null)"

# ACL
[[ "$(psql_q "select has_function_privilege('authenticated', '$S', 'EXECUTE')")" == 't' ]] || fail 'authenticated sem EXECUTE'
[[ "$(psql_q "select has_function_privilege('service_role', '$S', 'EXECUTE')")" == 't' ]] || fail 'service_role sem EXECUTE'
[[ "$(psql_q "select has_function_privilege('anon', '$S', 'EXECUTE')")" == 'f' ]] || fail 'anon com EXECUTE'
[[ "$(psql_q "select p.prosecdef from pg_proc p where p.oid = '$S'::regprocedure")" == 't' ]] || fail 'sem DEFINER'
[[ "$(psql_q "select array_to_string(p.proconfig, ',') from pg_proc p where p.oid = '$S'::regprocedure")" == 'search_path=public, pg_temp' ]] || fail 'sem search_path fixo'

# rollback EXTRAIDO da migration (nao reescrito); depois reaplica
rb="$(grep -m1 'drop function if exists public.talkx_insights' "$mig" | sed 's/^--//')"
[[ -n "$rb" ]] || fail 'rollback nao achado na migration'
psql_test -Atqc "$rb" >/dev/null
[[ "$(psql_q "select to_regprocedure('$S') is null")" == 't' ]] || fail 'rollback nao dropou'
psql_test < "$mig" >/dev/null || fail 'reaplicacao falhou'

echo '[OK] X075 talkx_insights: 4 regras, escopo, summary 90d, rollback.'
