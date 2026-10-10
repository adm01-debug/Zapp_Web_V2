#!/usr/bin/env bash
# Harness descartavel: N-124 / X075 — talkx_insights(p_from, p_to).
# Prova: as dicas por regra fixa (janela de 2h, segmento, template, cliques) saem
# do servidor com os parametros/tamanho de amostra esperados; massa abaixo do
# minimo nao gera dica; quem nao ve campanha nenhuma recebe `insights` vazio;
# summary.estimated_lift_pct so preenche com as 3 primeiras regras ativas e 10+
# campanhas concluidas nos ultimos 90 dias; e o rollback dropa a funcao.
# Aplica o ARQUIVO de migration real num PostgreSQL 17 descartavel e roda como o
# papel real (SET LOCAL ROLE authenticated), nunca como postgres no caminho feliz.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

test_password='talkx_insights_test_only'
cid="talkx-insights-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-insights-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos ---- que a migration real precisa enxergar
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid,
  template_id uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  sent_at timestamptz,
  replied_at timestamptz
);
CREATE TABLE public.talkx_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL
);
CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

-- controle de admin por GUC: o proprio teste decide quem e admin/supervisor
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.is_admin', true), 'false')::boolean
$$;
SQL

# ---- RED: antes da correcao talkx_insights(2 args) nao existe ----
red_exists="$(psql_q "select to_regprocedure('public.talkx_insights(timestamptz,timestamptz)') is not null")"
[[ "$red_exists" == 'f' ]] || fail 'RED: talkx_insights(timestamptz,timestamptz) nao deveria existir antes da migration'
red_err="$(psql_test -Atqc "select public.talkx_insights(now() - interval '30 days', now());" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: talkx_insights deveria nao existir antes da migration (got: $red_err)"

# ---- GREEN: aplica a migration NOVA ----
psql_test < "$repo_root/supabase/migrations/20261011000016_talkx_v4_insights_rules.sql" >/dev/null \
  || fail 'migration talkx_v4_insights_rules nao aplicou (GREEN)'

[[ "$(psql_q "select to_regprocedure('public.talkx_insights(timestamptz,timestamptz)') is not null")" == 't' ]] \
  || fail 'GREEN: talkx_insights(timestamptz,timestamptz) nao existe depois da migration'

# ---- dados de apoio ---------------------------------------------------------
# owner A: 5 campanhas com segmento (T1, high rate) + 4 sem segmento (T2, low
# rate) recentes + 1 sem segmento/T2 a 91 dias (fora da janela de 90 dias).
# owner C: massa abaixo do minimo (2 campanhas, 40 envios).
psql_test >/dev/null <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('50000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-00000000000c', '40000000-0000-0000-0000-00000000000c'),
  ('50000000-0000-0000-0000-00000000000d', '40000000-0000-0000-0000-00000000000d');

-- A: 5 com segmento, template T1, taxa 0.50
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, started_at, completed_at)
SELECT '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'completed', 100, 50,
       '50000000-0000-0000-0000-00000000000a', now() - interval '2 days', now() - interval '1 day'
FROM generate_series(1, 5);
-- A: 4 sem segmento, template T2, taxa 0.10 (recentes)
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, started_at, completed_at)
SELECT NULL, '20000000-0000-0000-0000-000000000002', 'completed', 100, 10,
       '50000000-0000-0000-0000-00000000000a', now() - interval '3 days', now() - interval '2 days'
FROM generate_series(1, 4);
-- A: 1 sem segmento, T2, a 91 dias (fora da janela de 90 dias)
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, started_at, completed_at)
VALUES (NULL, '20000000-0000-0000-0000-000000000002', 'completed', 100, 10,
        '50000000-0000-0000-0000-00000000000a', now() - interval '92 days', now() - interval '91 days');

-- A: 1 clique por campanha (taxa 0.01 < 5%)
INSERT INTO public.talkx_links (campaign_id)
SELECT id FROM public.talkx_campaigns WHERE created_by = '50000000-0000-0000-0000-00000000000a';
INSERT INTO public.talkx_link_clicks (link_id, clicked_at)
SELECT l.id, now() - interval '1 day'
FROM public.talkx_links l
JOIN public.talkx_campaigns c ON c.id = l.campaign_id
WHERE c.created_by = '50000000-0000-0000-0000-00000000000a';

-- A: enviados da janela — 200 as 10h BRT (60 respostas) e 100 as 20h BRT (10 respostas)
INSERT INTO public.talkx_recipients (campaign_id, sent_at, replied_at)
SELECT c.id,
       (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours') AT TIME ZONE 'America/Sao_Paulo',
       CASE WHEN g <= 60 THEN (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours' + interval '5 minutes') AT TIME ZONE 'America/Sao_Paulo' END
FROM (SELECT id FROM public.talkx_campaigns WHERE created_by = '50000000-0000-0000-0000-00000000000a' AND segment_id IS NOT NULL LIMIT 1) c,
     generate_series(1, 200) g;
INSERT INTO public.talkx_recipients (campaign_id, sent_at, replied_at)
SELECT c.id,
       (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '20 hours') AT TIME ZONE 'America/Sao_Paulo',
       CASE WHEN g <= 10 THEN (date_trunc('day', (now() - interval '3 days') AT TIME ZONE 'America/Sao_Paulo') + interval '20 hours' + interval '5 minutes') AT TIME ZONE 'America/Sao_Paulo' END
FROM (SELECT id FROM public.talkx_campaigns WHERE created_by = '50000000-0000-0000-0000-00000000000a' AND segment_id IS NOT NULL LIMIT 1) c,
     generate_series(1, 100) g;

-- C: 2 campanhas, 20 envios cada (abaixo do minimo de toda regra)
INSERT INTO public.talkx_campaigns (segment_id, template_id, status, sent_count, replied_count, created_by, started_at, completed_at)
SELECT NULL, '20000000-0000-0000-0000-000000000003', 'completed', 20, 2,
       '50000000-0000-0000-0000-00000000000c', now() - interval '2 days', now() - interval '1 day'
FROM generate_series(1, 2);
SQL

# roda como authenticated com claims; is_admin controlado por GUC
owner_a_q() { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='40000000-0000-0000-0000-00000000000a'; SET LOCAL test.is_admin='false'; $1 COMMIT;" 2>&1 || true; }
owner_c_q() { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='40000000-0000-0000-0000-00000000000c'; SET LOCAL test.is_admin='false'; $1 COMMIT;" 2>&1 || true; }
user_d_q()  { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='40000000-0000-0000-0000-00000000000d'; SET LOCAL test.is_admin='false'; $1 COMMIT;" 2>&1 || true; }
admin_q()   { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='40000000-0000-0000-0000-00000000000a'; SET LOCAL test.is_admin='true'; $1 COMMIT;" 2>&1 || true; }
period="public.talkx_insights(now() - interval '95 days', now())"

# 1) owner A: as 4 regras ativas com id/tipo/prioridade/acao esperados
res_a="$(owner_a_q "select $period;")"
[[ "$res_a" == *'"id": "best-window"'* ]] || fail 'faltou a dica best-window'
[[ "$res_a" == *'"id": "segment-lift"'* ]] || fail 'faltou a dica segment-lift'
[[ "$res_a" == *'"id": "best-template"'* ]] || fail 'faltou a dica best-template'
[[ "$res_a" == *'"id": "low-clicks"'* ]] || fail 'faltou a dica low-clicks'
[[ "$(owner_a_q "select $period->'summary'->>'rule_count';")" == '4' ]] || fail 'rule_count deveria ser 4 com a massa cheia'

# 2) parametros e amostra de cada regra
[[ "$(owner_a_q "select (select e->>'type' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == 'timing' ]] || fail 'best-window.type != timing'
[[ "$(owner_a_q "select (select e->>'priority' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == 'high' ]] || fail 'best-window.priority != high'
[[ "$(owner_a_q "select (select e->>'action' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == 'prefill_send_window' ]] || fail 'best-window.action != prefill_send_window'
[[ "$(owner_a_q "select (select e->'params'->>'hour' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == '10' ]] || fail 'best-window.params.hour != 10'
[[ "$(owner_a_q "select (select e->'params'->>'reply_rate_pct' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == '30.0' ]] || fail 'best-window.params.reply_rate_pct != 30.0'
[[ "$(owner_a_q "select (select e->'params'->>'avg_reply_rate_pct' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == '23.3' ]] || fail 'best-window.params.avg_reply_rate_pct != 23.3'
[[ "$(owner_a_q "select (select e->'params'->>'lift_pct' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == '28.6' ]] || fail 'best-window.params.lift_pct != 28.6'
[[ "$(owner_a_q "select (select e->>'sample' from jsonb_array_elements($period->'insights') e where e->>'id'='best-window');")" == '200' ]] || fail 'best-window.sample != 200'

[[ "$(owner_a_q "select (select e->'params'->>'with_segment_campaigns' from jsonb_array_elements($period->'insights') e where e->>'id'='segment-lift');")" == '5' ]] || fail 'segment-lift.with_segment_campaigns != 5'
[[ "$(owner_a_q "select (select e->'params'->>'without_segment_campaigns' from jsonb_array_elements($period->'insights') e where e->>'id'='segment-lift');")" == '5' ]] || fail 'segment-lift.without_segment_campaigns != 5'
[[ "$(owner_a_q "select (select e->>'action' from jsonb_array_elements($period->'insights') e where e->>'id'='segment-lift');")" == 'open_segments' ]] || fail 'segment-lift.action != open_segments'

[[ "$(owner_a_q "select (select e->'params'->>'campaigns' from jsonb_array_elements($period->'insights') e where e->>'id'='best-template');")" == '5' ]] || fail 'best-template.campaigns != 5'
[[ "$(owner_a_q "select (select e->'params'->>'sent' from jsonb_array_elements($period->'insights') e where e->>'id'='best-template');")" == '500' ]] || fail 'best-template.sent != 500'
[[ "$(owner_a_q "select (select e->>'action' from jsonb_array_elements($period->'insights') e where e->>'id'='best-template');")" == 'open_template' ]] || fail 'best-template.action != open_template'

[[ "$(owner_a_q "select (select e->'params'->>'low_click_campaigns' from jsonb_array_elements($period->'insights') e where e->>'id'='low-clicks');")" == '10' ]] || fail 'low-clicks.low_click_campaigns != 10'
[[ "$(owner_a_q "select (select e->'params'->>'completed_campaigns' from jsonb_array_elements($period->'insights') e where e->>'id'='low-clicks');")" == '10' ]] || fail 'low-clicks.completed_campaigns != 10'
[[ "$(owner_a_q "select (select e->'params'->>'avg_click_rate_pct' from jsonb_array_elements($period->'insights') e where e->>'id'='low-clicks');")" == '1.0' ]] || fail 'low-clicks.avg_click_rate_pct != 1.0'

# 3) summary: nulo com 9 campanhas concluidas em 90 dias; preenchido (teto 50) com 10
[[ "$(owner_a_q "select $period->'summary'->>'estimated_lift_pct' is null;")" == 't' ]] || fail 'estimated_lift_pct deveria ser nulo com 9 campanhas em 90 dias'
psql_test -Atqc "UPDATE public.talkx_campaigns SET completed_at = now() - interval '5 days' WHERE created_by = '50000000-0000-0000-0000-00000000000a' AND completed_at < now() - interval '90 days';" >/dev/null
[[ "$(owner_a_q "select $period->'summary'->>'estimated_lift_pct';")" == '50' ]] || fail 'estimated_lift_pct deveria ser 50 (teto) com 10 campanhas em 90 dias'

# 4) massa abaixo do minimo nao gera dica (owner C)
[[ "$(owner_c_q "select jsonb_array_length($period->'insights');")" == '0' ]] || fail 'owner C (abaixo do minimo) deveria receber 0 dicas'
[[ "$(owner_c_q "select $period->'summary'->>'rule_count';")" == '0' ]] || fail 'owner C deveria ter rule_count 0'
[[ "$(owner_c_q "select $period->'summary'->>'estimated_lift_pct' is null;")" == 't' ]] || fail 'owner C deveria ter estimated_lift_pct nulo'

# 5) quem nao ve campanha nenhuma recebe vazio (owner D), apesar da massa de A
[[ "$(user_d_q "select jsonb_array_length($period->'insights');")" == '0' ]] || fail 'owner D (sem campanha) deveria receber 0 dicas'
[[ "$(user_d_q "select $period->'summary'->>'rule_count';")" == '0' ]] || fail 'owner D deveria ter rule_count 0'
# admin com a mesma chamada enxerga a massa (escopo por papel)
[[ "$(admin_q "select $period->'summary'->>'rule_count';")" == '4' ]] || fail 'admin deveria ver as 4 regras'

# 6) entrada invalida recusada
bad_range="$(owner_a_q "select public.talkx_insights(now(), now() - interval '1 day');")"
[[ "$bad_range" == *'invalid_talkx_insights_period'* ]] || fail "periodo invertido deveria ser recusado (got: $bad_range)"
bad_null="$(owner_a_q "select public.talkx_insights(NULL, now());")"
[[ "$bad_null" == *'invalid_talkx_insights_period'* ]] || fail "p_from nulo deveria ser recusado (got: $bad_null)"

# 7) ACL e postura de seguranca
[[ "$(psql_q "select has_function_privilege('authenticated', 'public.talkx_insights(timestamptz,timestamptz)', 'EXECUTE')")" == 't' ]] || fail 'authenticated deveria ter EXECUTE'
[[ "$(psql_q "select has_function_privilege('service_role', 'public.talkx_insights(timestamptz,timestamptz)', 'EXECUTE')")" == 't' ]] || fail 'service_role deveria ter EXECUTE'
[[ "$(psql_q "select has_function_privilege('anon', 'public.talkx_insights(timestamptz,timestamptz)', 'EXECUTE')")" == 'f' ]] || fail 'anon NAO deveria ter EXECUTE'
[[ "$(psql_q "select p.prosecdef from pg_proc p where p.oid = 'public.talkx_insights(timestamptz,timestamptz)'::regprocedure")" == 't' ]] || fail 'deveria ser SECURITY DEFINER'
[[ "$(psql_q "select array_to_string(p.proconfig, ',') from pg_proc p where p.oid = 'public.talkx_insights(timestamptz,timestamptz)'::regprocedure")" == 'search_path=public, pg_temp' ]] || fail 'search_path fixo ausente'

# 8) rollback de verdade: o SQL documentado dropa a funcao
psql_test -Atqc "drop function if exists public.talkx_insights(timestamptz, timestamptz);" >/dev/null
[[ "$(psql_q "select to_regprocedure('public.talkx_insights(timestamptz,timestamptz)') is null")" == 't' ]] || fail 'rollback nao dropou talkx_insights'

echo '[OK] Talk X X075: talkx_insights(p_from, p_to) com 4 regras, escopo por campanha visivel, summary por 90 dias e rollback.'
