#!/usr/bin/env bash
# CT-E / PB-30 — prova em Postgres 17 descartavel (docker) que public.contacts_stats_series(boolean)
# devolve empresas_distinct e as 4 series do useContactsKpi (novos 30d em buckets de 4/6 dias,
# total cumulativo 12s, empresas cumulativas 12s, fornecedores por semana) com o MESMO escopo de
# public.contacts_stats / search_contacts: RED (funcao inexistente), arrays conferidos na mao para
# admin/agente A/agente B/escopo vazio, include_legacy, anon/PUBLIC sem EXECUTE, service_role le tudo,
# invariantes (soma dos 7 = novos 30d; ultimo ponto = total/empresas) e o Rollback do cabecalho
# voltando ao RED. A migration REAL e achada pelo marcador 'contacts_stats_series(boolean)'.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$(grep -rlF 'contacts_stats_series(boolean)' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$migration" && -f "$migration" ]] || { echo '[FALHA] migration de contacts_stats_series nao encontrada' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }
cid="contacts-stats-series-rpc-$RANDOM$RANDOM"
cleanup() { [[ "$cid" =~ ^contacts-stats-series-rpc-[0-9]+$ ]] && docker rm -f "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
assert_eq() { [[ "$3" == "$2" ]] || fail "$1: esperado '$2', obtido '$3'"; pass "$1 (= $3)"; }
assert_has() { [[ "$3" == *"$2"* ]] || fail "$1: esperado conter '$2', obtido -> $3"; pass "$1 ($2)"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=contacts_stats_series_test_only "${CONTACTS_STATS_SERIES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" >/dev/null
ready=false
for _ in $(seq 1 90); do
  m="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$m" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

user_admin='a0000000-0000-0000-0000-000000000001'; user_agent_a='a0000000-0000-0000-0000-000000000002'
user_agent_b='a0000000-0000-0000-0000-000000000003'; user_agent_c='a0000000-0000-0000-0000-000000000004'
prof_a='b0000000-0000-0000-0000-00000000000a'; prof_b='b0000000-0000-0000-0000-00000000000b'

# ── ambiente minimo: auth, roles, os 4 helpers que a RPC usa e a tabela contacts ──
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.user_profiles (user_id uuid NOT NULL PRIMARY KEY, profile_id uuid NOT NULL);
CREATE TABLE public.agent_visibility (user_id uuid NOT NULL PRIMARY KEY, visible uuid[] NOT NULL DEFAULT '{}'::uuid[]);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_uid AND r.role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.get_visible_agent_ids(_uid uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT unnest(COALESCE((SELECT v.visible FROM public.agent_visibility v WHERE v.user_id=_uid),'{}'::uuid[])) $$;
CREATE FUNCTION public.get_profile_id_for_user(_uid uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.profile_id FROM public.user_profiles p WHERE p.user_id=_uid $$;
CREATE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible uuid[], p_profile uuid, p_is_admin boolean)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(COALESCE(p_is_admin,false) OR p_assigned_to=ANY(COALESCE(p_visible,'{}'::uuid[])),false) $$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), public.get_visible_agent_ids(uuid),
  public.get_profile_id_for_user(uuid), public.can_edit_contact(uuid,uuid,uuid[],uuid,boolean) TO anon, authenticated, service_role;
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text NOT NULL, email text, company text,
  contact_type text, conversation_status text NOT NULL DEFAULT 'aberto', created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, is_lid_legacy boolean NOT NULL DEFAULT false, assigned_to uuid, queue_id uuid);
SQL

# 20 visiveis por padrao (idades .5 dia, sempre dentro de um dia inteiro): 12 do agente A, 8 do B.
# Fora por padrao: c21/c22 (legado, entram com include_legacy) e c23 (soft-deleted, nunca).
psql_exec >/dev/null <<SQL
INSERT INTO public.user_roles VALUES ('$user_admin','admin');
INSERT INTO public.user_profiles VALUES ('$user_agent_a','$prof_a'),('$user_agent_b','$prof_b');
INSERT INTO public.agent_visibility VALUES ('$user_agent_a', ARRAY['$prof_a']::uuid[]),
  ('$user_agent_b', ARRAY['$prof_b']::uuid[]), ('$user_agent_c', '{}'::uuid[]);
INSERT INTO public.contacts (id, phone, company, contact_type, created_at, deleted_at, is_lid_legacy, assigned_to) VALUES
  ('c1000000-0000-0000-0000-000000000001','11990000001','ACME',   'cliente',    now()-interval '0 days 12 hours', NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000002','11990000002','acme ',  'fornecedor', now()-interval '2 days 12 hours', NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000003','11990000003',NULL,     'cliente',    now()-interval '5 days 12 hours', NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000004','11990000004','BETA',   'fornecedor', now()-interval '6 days 12 hours', NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000005','11990000005','beta',   'cliente',    now()-interval '9 days 12 hours', NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000006','11990000006',NULL,     'cliente',    now()-interval '10 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000007','11990000007','GAMA',   'fornecedor', now()-interval '13 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000008','11990000008','ACME',   'cliente',    now()-interval '14 days 12 hours',NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000009','11990000009',NULL,     'cliente',    now()-interval '20 days 12 hours',NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000010','11990000010',NULL,     'fornecedor', now()-interval '23 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000011','11990000011','GAMA',   'cliente',    now()-interval '26 days 12 hours',NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000012','11990000012',NULL,     'cliente',    now()-interval '29 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000013','11990000013','DELTA',  'fornecedor', now()-interval '40 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000014','11990000014',NULL,     'cliente',    now()-interval '50 days 12 hours',NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000015','11990000015','DELTA',  'cliente',    now()-interval '60 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000016','11990000016',NULL,     'cliente',    now()-interval '80 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000017','11990000017','EPSILON','fornecedor', now()-interval '85 days 12 hours',NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000018','11990000018','ZETA',   'cliente',    now()-interval '200 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000019','11990000019',NULL,     'cliente',    now()-interval '210 days 12 hours',NULL,false,'$prof_b'),
  ('c1000000-0000-0000-0000-000000000020','11990000020',NULL,     'fornecedor', now()-interval '220 days 12 hours',NULL,false,'$prof_a'),
  ('c1000000-0000-0000-0000-000000000021','11990000021','OMEGA',  'cliente',    now()-interval '3 days 12 hours', NULL,true, '$prof_a'),
  ('c1000000-0000-0000-0000-000000000022','11990000022','OMEGA2', 'cliente',    now()-interval '4 days 12 hours', NULL,true, '$prof_a'),
  ('c1000000-0000-0000-0000-000000000023','11990000023','NOPE',   'cliente',    now()-interval '7 days 12 hours', now()-interval '1 day',false,'$prof_a');
SQL

admin="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_admin';"
ag_a="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_agent_a';"
ag_b="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_agent_b';"
ag_c="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_agent_c';"
anon="SET ROLE anon; SET request.jwt.claim.role='anon';"
svc="SET ROLE service_role; SET request.jwt.claim.role='service_role'; SET request.jwt.claim.sub='';"
f()  { echo "$1 SELECT public.contacts_stats_series($2)->'$3'::text"; }
fv() { echo "$1 SELECT public.contacts_stats_series($2)->>'$3'"; }

# ── RED ──────────────────────────────────────────────────────────────────────
assert_eq 'RED: funcao ainda nao existe' '' "$(psql_val "$admin SELECT to_regprocedure('public.contacts_stats_series(boolean)')::text")"
assert_has 'RED: chamar a RPC inexistente falha' 'does not exist' "$(psql_val "$admin SELECT public.contacts_stats_series()")"

psql_exec < "$migration" >/dev/null || fail 'migration nao aplicou'
pass "migration aplicada ($(basename "$migration"))"

# ── 1) admin ve tudo, cada array conferido na mao (20 visiveis) ──────────────
assert_eq '1. admin empresas_distinct (acme/beta/gama/delta/epsilon/zeta)' '6' "$(psql_val "$(fv "$admin" false empresas_distinct)")"
assert_eq '1. admin series_novos_daily_30'          '[2, 1, 1, 1, 2, 2, 3]'        "$(psql_val "$(f "$admin" false series_novos_daily_30)")"
assert_eq '1. admin series_total_cumulative_12w'    '[5, 5, 5, 6, 7, 7, 8, 9, 11, 13, 16, 20]' "$(psql_val "$(f "$admin" false series_total_cumulative_12w)")"
assert_eq '1. admin series_empresas_cumulative_12w' '[2, 2, 2, 3, 3, 3, 3, 3, 4, 5, 6, 6]' "$(psql_val "$(f "$admin" false series_empresas_cumulative_12w)")"
assert_eq '1. admin series_fornecedores_weekly_12'  '[0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 2]' "$(psql_val "$(f "$admin" false series_fornecedores_weekly_12)")"

# ── 2) agente comum ve SO o que enxerga (A=12, B=8, C=0) ─────────────────────
assert_eq '2. agente A empresas_distinct' '5' "$(psql_val "$(fv "$ag_a" false empresas_distinct)")"
assert_eq '2. agente A series_novos_daily_30'          '[1, 1, 0, 0, 2, 1, 2]'          "$(psql_val "$(f "$ag_a" false series_novos_daily_30)")"
assert_eq '2. agente A series_total_cumulative_12w'    '[3, 3, 3, 4, 4, 4, 5, 6, 7, 7, 10, 12]' "$(psql_val "$(f "$ag_a" false series_total_cumulative_12w)")"
assert_eq '2. agente A series_empresas_cumulative_12w' '[1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 4, 5]' "$(psql_val "$(f "$ag_a" false series_empresas_cumulative_12w)")"
assert_eq '2. agente A series_fornecedores_weekly_12'  '[0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1]' "$(psql_val "$(f "$ag_a" false series_fornecedores_weekly_12)")"
assert_eq '2. agente B empresas_distinct' '4' "$(psql_val "$(fv "$ag_b" false empresas_distinct)")"
assert_eq '2. agente B series_novos_daily_30'          '[1, 0, 1, 1, 0, 1, 1]'          "$(psql_val "$(f "$ag_b" false series_novos_daily_30)")"
assert_eq '2. agente B series_total_cumulative_12w'    '[2, 2, 2, 2, 3, 3, 3, 3, 4, 6, 6, 8]' "$(psql_val "$(f "$ag_b" false series_total_cumulative_12w)")"
assert_eq '2. agente B series_empresas_cumulative_12w' '[1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 3, 4]' "$(psql_val "$(f "$ag_b" false series_empresas_cumulative_12w)")"
assert_eq '2. agente B series_fornecedores_weekly_12'  '[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]' "$(psql_val "$(f "$ag_b" false series_fornecedores_weekly_12)")"
assert_eq '2. escopo vazio (C) empresas_distinct' '0' "$(psql_val "$(fv "$ag_c" false empresas_distinct)")"
assert_eq '2. escopo vazio daily zeros'  '[0, 0, 0, 0, 0, 0, 0]' "$(psql_val "$(f "$ag_c" false series_novos_daily_30)")"
assert_eq '2. escopo vazio total zeros'  '[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]' "$(psql_val "$(f "$ag_c" false series_total_cumulative_12w)")"

# ── 3) include_legacy traz c21/c22 (legado) mas NAO ressuscita o soft-deleted ─
assert_eq '3. admin include_legacy empresas_distinct (8)' '8' "$(psql_val "$(fv "$admin" true empresas_distinct)")"
assert_eq '3. admin include_legacy daily' '[2, 1, 1, 1, 2, 2, 5]' "$(psql_val "$(f "$admin" true series_novos_daily_30)")"
assert_eq '3. admin include_legacy total last 22' '[5, 5, 5, 6, 7, 7, 8, 9, 11, 13, 16, 22]' "$(psql_val "$(f "$admin" true series_total_cumulative_12w)")"
assert_eq '3. admin include_legacy emp last 8' '[2, 2, 2, 3, 3, 3, 3, 3, 4, 5, 6, 8]' "$(psql_val "$(f "$admin" true series_empresas_cumulative_12w)")"
assert_eq '3. agente A include_legacy empresas_distinct (5+2)' '7' "$(psql_val "$(fv "$ag_a" true empresas_distinct)")"
assert_eq '3. agente A include_legacy daily' '[1, 1, 0, 0, 2, 1, 4]' "$(psql_val "$(f "$ag_a" true series_novos_daily_30)")"
assert_eq '3. include_legacy mantem soft-deleted fora (visiveis=22)' '22' "$(psql_val "SELECT count(*)::text FROM public.contacts c WHERE c.deleted_at IS NULL")"
assert_eq '3. include_legacy=NULL cai no padrao (COALESCE)' '6' "$(psql_val "$admin SELECT public.contacts_stats_series(NULL)->>'empresas_distinct'")"

# ── 4) ACL: anon/PUBLIC sem EXECUTE e chamada negada ─────────────────────────
assert_eq '4. anon sem EXECUTE' 'false' "$(psql_val "SELECT has_function_privilege('anon','public.contacts_stats_series(boolean)','EXECUTE')::text")"
assert_eq '4. PUBLIC sem EXECUTE' 'true' "$(psql_val "SELECT (NOT (SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='contacts_stats_series' AND p.pronargs=1) ~ '(^|,)=X/')::text")"
assert_has '4. anon nao executa' 'permission denied' "$(psql_val "$anon SELECT public.contacts_stats_series()")"

# ── 5) service_role le tudo (== admin) ──────────────────────────────────────
assert_eq '5. service_role empresas_distinct' '6' "$(psql_val "$(fv "$svc" false empresas_distinct)")"
assert_eq '5. service_role total last igual admin' '[5, 5, 5, 6, 7, 7, 8, 9, 11, 13, 16, 20]' "$(psql_val "$(f "$svc" false series_total_cumulative_12w)")"

# ── 6) invariantes do contrato ──────────────────────────────────────────────
assert_eq '6. soma dos 7 buckets = novos dos ultimos 30d (admin)' '12' \
  "$(psql_val "$admin SELECT (SELECT sum(x::int) FROM jsonb_array_elements_text(public.contacts_stats_series(false)->'series_novos_daily_30') x)::text")"
assert_eq '6. ultimo ponto do total cumulativo = total visivel (admin)' '20' \
  "$(psql_val "$admin SELECT (public.contacts_stats_series(false)->'series_total_cumulative_12w'->>-1)::text")"
assert_eq '6. ultimo ponto de empresas = empresas_distinct (agente A)' '5' \
  "$(psql_val "$ag_a SELECT (public.contacts_stats_series(false)->'series_empresas_cumulative_12w'->>-1)::text")"

# ── 7) Rollback do cabecalho volta ao RED ───────────────────────────────────
rb="$(awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f&&!/^--   /{exit}' "$migration")"
[[ -n "$rb" ]] || fail 'Rollback executavel nao encontrado no cabecalho'
printf '%s\n' "$rb" | psql_exec >/dev/null || fail 'Rollback nao executou'
pass 'Rollback do cabecalho executou'
assert_eq '7. apos Rollback a funcao nao existe' '' "$(psql_val "SELECT to_regprocedure('public.contacts_stats_series(boolean)')::text")"

echo '[OK] CT-E/PB-30: contacts_stats_series respeita o escopo de contacts_stats/search_contacts, calcula empresas_distinct e as 4 series do useContactsKpi com as janelas do aggregateKpi, inclui legados sob include_legacy, nega anon/PUBLIC e o Rollback remove a funcao.'
