#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — DASHBOARD-03 (paridade V3 -> V2).
#
# Prova, em PostgreSQL 17, que a RPC public.dashboard_daily_series(p_days int)
# devolve a serie diaria de atividade no fuso de America/Sao_Paulo e que a trava
# de papel funciona:
#   RED (antes da migration 20261012235745): a funcao nao existe.
#   GREEN (depois):
#     1. admin e supervisor leem a serie; os numeros batem com a contagem manual;
#     2. authenticated NAO-staff (agente comum) -> 42501 dashboard_daily_series_requires_staff;
#     3. anon nao tem EXECUTE (ACL) e PUBLIC fica sem EXECUTE;
#     4. service_role (chamador interno) le, mesmo sem papel de usuario;
#     5. p_days e limitado a 90 (1000 -> 90 linhas) e o piso e 1 (0 -> 1 linha);
#        dias sem movimento aparecem com contadores 0 e mediana NULL (sem amostra);
#     6. reaplicar a migration nao quebra (idempotencia);
#     7. o Rollback do cabecalho roda e remove a funcao (volta ao RED).
#
# A migration REAL e referenciada pelo NOME DO ARQUIVO (pinado), nunca por busca
# por marcador: a busca por marcador (`grep -rlF ... | tail -1`) passaria a
# devolver uma migration futura (ex.: _v2) depois que ela existir, e o passo 7
# (Rollback) reaplicaria a migration errada. O objeto sob teste e aplicado do
# arquivo real de supabase/migrations, nunca recriado aqui.
#
# Fixtures: apenas o ambiente minimo (schema auth, roles, IS_ADMIN_OR_SUPERVISOR e
# as 4 tabelas que a RPC le) que a migration real toca. As tabelas sao stubs com
# as colunas usadas pela RPC (messages, contacts, conversation_closures,
# conversation_sla) — o mesmo padrao dos harnesses irmaos.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$repo_root/supabase/migrations/20261012235745_dashboard_daily_series.sql"
[[ -f "$migration" ]] || { printf '[FALHA] migration 20261012235745_dashboard_daily_series.sql nao encontrada\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="dashboard-daily-series-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^dashboard-daily-series-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${DASHBOARD_DAILY_SERIES_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=dashboard_daily_series_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── identificadores ───────────────────────────────────────────────────────────
user_admin='a0000000-0000-0000-0000-000000000001'
user_agent='a0000000-0000-0000-0000-000000000002'
user_super='a0000000-0000-0000-0000-000000000003'

# ── fixtures ─────────────────────────────────────────────────────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

-- Stub de ambiente: mesma semantica do public.is_admin_or_supervisor real.
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid AND r.role IN ('admin','supervisor'))
  $$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO anon, authenticated, service_role;

-- Helper de fixture: meia-noite (America/Sao_Paulo) de N dias atras, como timestamptz.
CREATE FUNCTION public.fixture_sp_day_back(days_ago integer) RETURNS timestamptz
  LANGUAGE sql STABLE AS $$
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(days => days_ago))
           AT TIME ZONE 'America/Sao_Paulo'
  $$;

-- Stubs das tabelas que a RPC le (colunas usadas pela RPC).
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sender text NOT NULL,
  is_deleted boolean DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.conversation_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  first_message_at timestamptz NOT NULL,
  first_response_at timestamptz
);
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.user_roles (user_id, role) VALUES
  ('$user_admin', 'admin'),
  ('$user_super', 'supervisor');

-- Contatos: c1 hoje-2, c2 hoje-1, c3 hoje-1 mas soft-deleted, c4 hoje.
INSERT INTO public.contacts (id, created_at, deleted_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', public.fixture_sp_day_back(2) + interval '10 hours', NULL),
  ('c2000000-0000-0000-0000-000000000002', public.fixture_sp_day_back(1) + interval '9 hours', NULL),
  ('c3000000-0000-0000-0000-000000000003', public.fixture_sp_day_back(1) + interval '12 hours', public.fixture_sp_day_back(1) + interval '13 hours'),
  ('c4000000-0000-0000-0000-000000000004', public.fixture_sp_day_back(0) + interval '8 hours', NULL);

-- Mensagens (sender, contacto, dia, data).
-- hoje-2: c1 e c6 recebidas e respondidas (2 recebidas + 2 enviadas).
INSERT INTO public.messages (contact_id, sender, created_at, is_deleted) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'contact', public.fixture_sp_day_back(2) + interval '10 hours 5 minutes', false),
  ('c1000000-0000-0000-0000-000000000001', 'agent',   public.fixture_sp_day_back(2) + interval '10 hours 6 minutes', false),
  ('c6000000-0000-0000-0000-000000000006', 'contact', public.fixture_sp_day_back(2) + interval '11 hours', false),
  ('c6000000-0000-0000-0000-000000000006', 'agent',   public.fixture_sp_day_back(2) + interval '11 hours 2 minutes', false),
  -- hoje-1: c2 recebida, c2 respondida; c1 enviada de novo (nao reabre); c3 recebida; c5 so mensagem deletada.
  ('c2000000-0000-0000-0000-000000000002', 'contact', public.fixture_sp_day_back(1) + interval '9 hours 10 minutes', false),
  ('c2000000-0000-0000-0000-000000000002', 'agent',   public.fixture_sp_day_back(1) + interval '9 hours 11 minutes', false),
  ('c1000000-0000-0000-0000-000000000001', 'agent',   public.fixture_sp_day_back(1) + interval '11 hours', false),
  ('c3000000-0000-0000-0000-000000000003', 'contact', public.fixture_sp_day_back(1) + interval '12 hours 5 minutes', false),
  ('c5000000-0000-0000-0000-000000000005', 'contact', public.fixture_sp_day_back(1) + interval '14 hours', true),
  -- hoje: c4 recebida + c4 respondida; c2 recebida + c2 respondida (conversa ja iniciada ontem);
  -- mensagem de sistema sem contacto (conta como enviada, nao como contacto ativo).
  ('c4000000-0000-0000-0000-000000000004', 'contact', public.fixture_sp_day_back(0) + interval '8 hours 5 minutes', false),
  ('c4000000-0000-0000-0000-000000000004', 'agent',   public.fixture_sp_day_back(0) + interval '8 hours 6 minutes', false),
  ('c2000000-0000-0000-0000-000000000002', 'contact', public.fixture_sp_day_back(0) + interval '9 hours', false),
  ('c2000000-0000-0000-0000-000000000002', 'agent',   public.fixture_sp_day_back(0) + interval '9 hours 1 minute', false),
  (NULL,                                   'agent',   public.fixture_sp_day_back(0) + interval '9 hours 30 minutes', false);

-- Encerramentos: hoje-1 o c2 fecha duas vezes (DISTINCT -> 1); hoje o c1 fecha.
INSERT INTO public.conversation_closures (contact_id, created_at) VALUES
  ('c2000000-0000-0000-0000-000000000002', public.fixture_sp_day_back(1) + interval '15 hours'),
  ('c2000000-0000-0000-0000-000000000002', public.fixture_sp_day_back(1) + interval '16 hours 30 minutes'),
  ('c1000000-0000-0000-0000-000000000001', public.fixture_sp_day_back(0) + interval '18 hours');

-- SLA: hoje-2 {60s, 120s} -> mediana 90; hoje-1 {60s, sem resposta} -> mediana 60;
-- hoje {120s, 30s} -> mediana 75.
INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', public.fixture_sp_day_back(2) + interval '10 hours 5 minutes', public.fixture_sp_day_back(2) + interval '10 hours 6 minutes'),
  ('c6000000-0000-0000-0000-000000000006', public.fixture_sp_day_back(2) + interval '11 hours',          public.fixture_sp_day_back(2) + interval '11 hours 2 minutes'),
  ('c2000000-0000-0000-0000-000000000002', public.fixture_sp_day_back(1) + interval '9 hours 10 minutes', public.fixture_sp_day_back(1) + interval '9 hours 11 minutes'),
  ('c3000000-0000-0000-0000-000000000003', public.fixture_sp_day_back(1) + interval '12 hours 5 minutes', NULL),
  ('c4000000-0000-0000-0000-000000000004', public.fixture_sp_day_back(0) + interval '8 hours 5 minutes',  public.fixture_sp_day_back(0) + interval '8 hours 7 minutes'),
  ('c5000000-0000-0000-0000-000000000005', public.fixture_sp_day_back(0) + interval '10 hours',           public.fixture_sp_day_back(0) + interval '10 hours 30 seconds');
SQL

# ── sessoes por papel ────────────────────────────────────────────────────────
agent_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_agent';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"
super_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_super';"
anon_session="SET ROLE anon; SET request.jwt.claim.role = 'anon';"
# service_role sem usuario com papel: exercita o ramo auth.role() = 'service_role'.
svc_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '';"

series_line_sql() { # $1 = p_days
  echo "SELECT string_agg(l, ' | ' ORDER BY d) FROM (SELECT metric_date d, messages_received||','||messages_sent||','||new_contacts||','||conversations_opened||','||conversations_resolved||','||active_contacts||','||coalesce(median_response_time_seconds::text,'NULL') AS l FROM public.dashboard_daily_series($1)) t"
}

# ═════════════════════════════════════════════════════════════════════════════
# RED — antes da migration: a funcao nao existe
# ═════════════════════════════════════════════════════════════════════════════
red_exist="$(psql_val "$admin_session SELECT to_regprocedure('public.dashboard_daily_series(integer)')::text")"
assert_eq 'RED: a funcao ainda nao existe' '' "$red_exist"
red_call="$(psql_val "$admin_session SELECT count(*) FROM public.dashboard_daily_series(3)")"
assert_has 'RED: chamar a RPC inexistente falha' 'does not exist' "$red_call"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration real
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration de dashboard_daily_series nao aplicou'
pass "migration aplicada ($(basename "$migration"))"

# ── 1) admin/supervisor leem e os numeros batem com a contagem manual ─────────
expected_3="2,2,1,2,0,2,90 | 2,2,1,2,1,3,60 | 2,3,1,1,1,2,75"
admin_series="$(psql_val "$admin_session $(series_line_sql 3)")"
assert_eq '1. admin: serie de 3 dias bate com a contagem manual' "$expected_3" "$admin_series"
super_series="$(psql_val "$super_session $(series_line_sql 3)")"
assert_eq '1. supervisor le a mesma serie' "$expected_3" "$super_series"

# ── 2) authenticated NAO-staff (agente comum) -> 42501 ───────────────────────
agent_call="$(psql_val "$agent_session SELECT count(*) FROM public.dashboard_daily_series(3)")"
assert_has '2. agente comum e barrado (42501 dashboard_daily_series_requires_staff)' 'dashboard_daily_series_requires_staff' "$agent_call"
agent_call_default="$(psql_val "$agent_session SELECT count(*) FROM public.dashboard_daily_series()")"
assert_has '2. agente comum barrado tambem no DEFAULT (p_days omitido)' 'dashboard_daily_series_requires_staff' "$agent_call_default"

# ── 3) anon e PUBLIC sem EXECUTE ─────────────────────────────────────────────
anon_acl="$(psql_val "SELECT has_function_privilege('anon', 'public.dashboard_daily_series(integer)', 'EXECUTE')::text")"
assert_eq '3. anon sem EXECUTE' 'false' "$anon_acl"
pub_acl="$(psql_val "SELECT EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='dashboard_daily_series' AND p.pronargs=1), acldefault('f',(SELECT proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='dashboard_daily_series' AND p.pronargs=1)))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')::text")"
assert_eq '3. PUBLIC sem EXECUTE' 'false' "$pub_acl"
anon_call="$(psql_val "$anon_session SELECT count(*) FROM public.dashboard_daily_series(3)")"
assert_has '3. anon nao executa' 'permission denied' "$anon_call"

# ── 4) service_role (chamador interno) le ────────────────────────────────────
svc_series="$(psql_val "$svc_session $(series_line_sql 3)")"
assert_eq '4. service_role le a serie mesmo sem papel de usuario' "$expected_3" "$svc_series"

# ── 5) limites de p_days e dias sem movimento ────────────────────────────────
default_rows="$(psql_val "$admin_session SELECT count(*) FROM public.dashboard_daily_series()")"
assert_eq '5. DEFAULT p_days=7 -> 7 linhas' '7' "$default_rows"
cap_rows="$(psql_val "$admin_session SELECT count(*) FROM public.dashboard_daily_series(1000)")"
assert_eq '5. p_days=1000 limitado a 90 -> 90 linhas' '90' "$cap_rows"
floor_rows="$(psql_val "$admin_session SELECT count(*) FROM public.dashboard_daily_series(0)")"
assert_eq '5. p_days=0 tem piso 1 -> 1 linha' '1' "$floor_rows"
first_empty="$(psql_val "$admin_session SELECT messages_received||','||messages_sent||','||new_contacts||','||conversations_opened||','||conversations_resolved||','||active_contacts||','||coalesce(median_response_time_seconds::text,'NULL') FROM public.dashboard_daily_series(5) ORDER BY metric_date LIMIT 1")"
assert_eq '5. dia sem movimento: contadores 0 e mediana NULL' '0,0,0,0,0,0,NULL' "$first_empty"

# ── 6) idempotencia ──────────────────────────────────────────────────────────
psql_exec < "$migration" >/dev/null || fail 'migration nao reaplicou (idempotencia)'
pass 'migration reaplicada sem erro (idempotencia)'
admin_again="$(psql_val "$admin_session $(series_line_sql 3)")"
assert_eq '6. serie identica apos reaplicar' "$expected_3" "$admin_again"

# ── 7) o Rollback do cabecalho roda e remove a funcao ────────────────────────
# Extracao estrita: ancora na linha-marcador exata e captura SOMENTE as linhas
# de instrucao SQL (`--   `, tres espacos) IMEDIATAMENTE apos ela; a primeira
# linha fora desse marcador encerra (prosa de cabecalho, mesmo iniciada por
# `-- `, nunca chega ao psql). Se nenhuma linha de instrucao existir, falha.
rollback_sql="$(awk '/^-- Rollback \(SQL executável, na ordem\):$/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'Rollback executavel nao encontrado no cabecalho da migration'
printf '%s\n' "$rollback_sql" | psql_exec >/dev/null || fail 'Rollback do cabecalho nao executou'
pass 'Rollback do cabecalho executou'
rolled_exist="$(psql_val "SELECT to_regprocedure('public.dashboard_daily_series(integer)')::text")"
assert_eq '7. apos o Rollback a funcao nao existe (volta ao RED)' '' "$rolled_exist"

echo '[OK] DASHBOARD-03: dashboard_daily_series devolve a serie diaria correta (fuso de Sao Paulo), exige admin/supervisor ou service_role, mantem anon/PUBLIC sem EXECUTE, limita p_days a 90 e o Rollback remove a funcao.'
