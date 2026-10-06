#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — item 122 / R3-DELTA-003.
#
# Defeito: o cursor de log do Talk X por timestamp perde linhas empatadas.
# public.talkx_campaign_logs lia `created_at > p_after` com `ORDER BY created_at, id`.
# O log e gravado em lote (varias linhas no mesmo created_at), entao a pagina seguinte
# descartava a cauda empatada com o cursor: linhas sumiam sem erro.
#
# Prova:
#   RED (com a migration REAL de X033, 20261003242707, e nada mais):
#     - 5 linhas, sendo 3 no MESMO created_at; paginando de 2 em 2 pelo cursor de
#       timestamp, a caminhada devolve 4 das 5 — a 3a linha empatada nunca aparece.
#   GREEN (depois da migration nova do item 122):
#     1. cursor COMPOSTO (created_at, id): a caminhada devolve as 5 linhas, sem perder
#        e sem repetir;
#     2. cursor incompleto (p_after sem p_after_id) ERRA com talkx_campaign_logs_cursor_incompleto
#        em vez de devolver menos linhas (o defeito nao volta em silencio);
#     3. a chamada de 1a pagina ja documentada (campanha, NULL, limite) continua funcionando;
#     4. a assinatura antiga (uuid,timestamptz,integer) foi removida: nao sobra overload
#        aberto que ainda perderia linhas;
#     5. ACL mantido: sem PUBLIC/anon, admin e service_role executam; agente nao-admin e barrado;
#     6. idempotencia: reaplicar a migration nao quebra;
#     7. o Rollback da linha 2 RODA e devolve a assinatura antiga.
#
# As migrations sao encontradas por marcador interno (sobrevivem ao rename do
# hermes-db-migrar --nova): base = 'talkx_x033_objetos_ausentes'; nova = 'talkx_campaign_logs_cursor_incompleto'.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

base_migration="$(grep -rlF 'talkx_x033_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$base_migration" && -f "$base_migration" ]] || { printf '[FALHA] migration base X033 nao encontrada (marcador talkx_x033_objetos_ausentes)\n' >&2; exit 1; }

fix_migration="$(grep -rlF 'talkx_campaign_logs_cursor_incompleto' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$fix_migration" && -f "$fix_migration" ]] || { printf '[FALHA] migration do item 122 nao encontrada (marcador talkx_campaign_logs_cursor_incompleto)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-logs-cursor-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-logs-cursor-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_raw()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

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
pg_image="${TALKX_LOGS_CURSOR_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_logs_cursor_test_only "$pg_image" >/dev/null

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
profile_admin='b0000000-0000-0000-0000-000000000001'
c_log='c0000000-0000-0000-0000-000000000001'
l_a1='11111111-1111-1111-1111-0000000000a1'
l_a2='11111111-1111-1111-1111-0000000000a2'
l_a3='11111111-1111-1111-1111-0000000000a3'
l_b1='11111111-1111-1111-1111-0000000000b1'
l_b2='11111111-1111-1111-1111-0000000000b2'
t1='2026-01-01 12:00:00+00'
t2='2026-01-01 12:00:01+00'

# ── fixtures (o suficiente para a migration REAL de X033 aplicar) ─────────────
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
-- is_admin_or_supervisor: so o perfil admin (user_admin) e privilegiado.
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT _uid = 'a0000000-0000-0000-0000-000000000001'::uuid $$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT 'Oi',
  status text NOT NULL DEFAULT 'draft',
  whatsapp_connection_id uuid,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  worker_id text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  total_recipients integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
  sent_at timestamptz,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  delivery_claim_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid,
  recipient_id uuid,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  ua text,
  ip_hash text
);

-- Stub do pg_cron: o cron do Talk X ('talkx-scheduler-1min') e as execucoes.
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE cron.job_run_details (
  jobid bigint,
  runid bigserial PRIMARY KEY,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
);
INSERT INTO cron.job (jobname, schedule, command)
  VALUES ('talkx-scheduler-1min', '* * * * *', 'SELECT public.trigger_talkx_engine_tick()');

-- Stubs do Vault/net (resolvidos so em runtime do tick, nao no CREATE).
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text
);

CREATE FUNCTION public.get_talkx_cron_secret() RETURNS text LANGUAGE sql AS $$ SELECT 'segredo-de-teste'::text $$;
CREATE FUNCTION public.kick_talkx_campaign(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
CREATE FUNCTION public.sweep_talkx_stuck_recipients(p integer) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.complete_talkx_campaign_if_drained(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

GRANT SELECT ON public.talkx_campaigns, public.talkx_recipients, public.talkx_settings TO authenticated, service_role;

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('last_purge_at', 'null'::jsonb, 'fixture'),
  ('retention_days_message', '180'::jsonb, 'fixture'),
  ('retention_days_clicks', '365'::jsonb, 'fixture'),
  ('retention_days_test_sends', '90'::jsonb, 'fixture'),
  ('retention_days_ai', '90'::jsonb, 'fixture'),
  ('business_hours', '{"tz":"America/Sao_Paulo","start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb, 'fixture');
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, is_active) VALUES ('$profile_admin', '$user_admin', true);
INSERT INTO public.talkx_campaigns (id, name, message_template, status) VALUES ('$c_log', 'Log', 'Oi', 'sending');
SQL

# ── RED: aplica SO a migration REAL de X033 e reproduz a perda de linhas ──────
psql_exec < "$base_migration" >/dev/null || fail 'migration base X033 nao aplicou (RED)'
pass "migration base aplicada ($(basename "$base_migration"))"

service_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '$user_admin';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_agent';"

# 5 linhas: 3 no MESMO created_at (t1) + 2 no created_at seguinte (t2). Lote real.
psql_val "INSERT INTO public.talkx_delivery_log (id, campaign_id, attempt, stage, outcome, created_at) VALUES
  ('$l_a1', '$c_log', 1, 'dispatch', 'sent', '$t1'),
  ('$l_a2', '$c_log', 1, 'dispatch', 'sent', '$t1'),
  ('$l_a3', '$c_log', 1, 'dispatch', 'sent', '$t1'),
  ('$l_b1', '$c_log', 1, 'dispatch', 'sent', '$t2'),
  ('$l_b2', '$c_log', 1, 'dispatch', 'sent', '$t2')" >/dev/null
total_rows="$(psql_val "SELECT count(*) FROM public.talkx_delivery_log WHERE campaign_id = '$c_log'")"
assert_eq 'RED: 5 linhas de log gravadas' '5' "$total_rows"

# Caminhada de paginacao de 2 em 2 com o cursor de TIMESTAMP (contrato antigo):
# p1 = (NULL) ; p2 = (created_at da ultima linha lida) ; p3 = (idem).
red_p1="$(psql_val "$service_session SELECT string_agg(id::text, ',' ORDER BY created_at, id) FROM public.talkx_campaign_logs('$c_log', NULL, 2)")"
assert_eq 'RED: pagina 1 (cursor de timestamp) devolve as 2 primeiras' "$l_a1,$l_a2" "$red_p1"
red_p2="$(psql_val "$service_session SELECT string_agg(id::text, ',' ORDER BY created_at, id) FROM public.talkx_campaign_logs('$c_log', '$t1', 2)")"
assert_eq 'RED: pagina 2 (p_after = created_at empatado) pula a cauda empatada' "$l_b1,$l_b2" "$red_p2"
red_p3="$(psql_val "$service_session SELECT string_agg(id::text, ',' ORDER BY created_at, id) FROM public.talkx_campaign_logs('$c_log', '$t2', 2)")"
assert_eq 'RED: pagina 3 nao traz mais nada' '' "$red_p3"
red_seen="$(psql_val "$service_session SELECT count(*) FROM (
  SELECT id FROM public.talkx_campaign_logs('$c_log', NULL, 2)
  UNION SELECT id FROM public.talkx_campaign_logs('$c_log', '$t1', 2)
  UNION SELECT id FROM public.talkx_campaign_logs('$c_log', '$t2', 2)) u")"
assert_eq 'RED: a caminhada devolve 4 das 5 linhas (1 empatada perdida)' '4' "$red_seen"
red_lost="$(psql_val "$service_session SELECT count(*) FROM public.talkx_delivery_log WHERE campaign_id = '$c_log' AND id NOT IN (
  SELECT id FROM public.talkx_campaign_logs('$c_log', NULL, 2)
  UNION SELECT id FROM public.talkx_campaign_logs('$c_log', '$t1', 2)
  UNION SELECT id FROM public.talkx_campaign_logs('$c_log', '$t2', 2))")"
assert_eq 'RED: a linha empatada l_a3 nunca aparece' '1' "$red_lost"

# ── GREEN: aplica a migration do item 122 ────────────────────────────────────
psql_exec < "$fix_migration" >/dev/null || fail 'migration do item 122 nao aplicou (GREEN)'
pass "migration do item 122 aplicada ($(basename "$fix_migration"))"

# 1) caminhada de paginacao com o cursor COMPOSTO (created_at, id) de 2 em 2
g_p1="$(psql_val "$service_session SELECT string_agg(id::text, ',' ORDER BY created_at, id) FROM public.talkx_campaign_logs('$c_log', NULL, 2)")"
assert_eq '1. pagina 1 (cursor composto) devolve as 2 primeiras' "$l_a1,$l_a2" "$g_p1"
g_c1="$(psql_val "$service_session SELECT id::text FROM public.talkx_campaign_logs('$c_log', NULL, 2) ORDER BY created_at DESC, id DESC LIMIT 1")"
assert_eq '1. cursor da pagina 1 = ultima linha (l_a2)' "$l_a2" "$g_c1"
g_p2="$(psql_val "$service_session SELECT string_agg(id::text, ',' ORDER BY created_at, id) FROM public.talkx_campaign_logs(p_campaign_id => '$c_log', p_after => '$t1', p_limit => 2, p_after_id => '$g_c1'::uuid)")"
assert_eq '1. pagina 2 entrega a cauda empatada + a proxima (l_a3, l_b1)' "$l_a3,$l_b1" "$g_p2"
g_c2="$(psql_val "$service_session SELECT id::text FROM public.talkx_campaign_logs(p_campaign_id => '$c_log', p_after => '$t1', p_limit => 2, p_after_id => '$g_c1'::uuid) ORDER BY created_at DESC, id DESC LIMIT 1")"
assert_eq '1. cursor da pagina 2 = ultima linha (l_b1)' "$l_b1" "$g_c2"
g_p3="$(psql_val "$service_session SELECT string_agg(id::text, ',' ORDER BY created_at, id) FROM public.talkx_campaign_logs(p_campaign_id => '$c_log', p_after => '$t2', p_limit => 2, p_after_id => '$g_c2'::uuid)")"
assert_eq '1. pagina 3 devolve a ultima linha (l_b2)' "$l_b2" "$g_p3"
g_seen="$(psql_val "$service_session SELECT count(*) FROM (
  SELECT id FROM public.talkx_campaign_logs('$c_log', NULL, 2)
  UNION SELECT id FROM public.talkx_campaign_logs(p_campaign_id => '$c_log', p_after => '$t1', p_limit => 2, p_after_id => '$l_a2'::uuid)
  UNION SELECT id FROM public.talkx_campaign_logs(p_campaign_id => '$c_log', p_after => '$t2', p_limit => 2, p_after_id => '$l_b1'::uuid)) u")"
assert_eq '1. a caminhada devolve as 5 linhas (nenhuma perdida)' '5' "$g_seen"

# 2) cursor incompleto (p_after sem p_after_id) ERRA em vez de perder linhas
guard="$(psql_raw "$service_session SELECT count(*) FROM public.talkx_campaign_logs(p_campaign_id => '$c_log', p_after => '$t1', p_limit => 2)")"
assert_has '2. cursor de timestamp sozinho levanta talkx_campaign_logs_cursor_incompleto' 'talkx_campaign_logs_cursor_incompleto' "$guard"

# 3) primeira pagina documentada (campanha, NULL, limite) continua funcionando
doc_first="$(psql_val "$service_session SELECT count(*) FROM public.talkx_campaign_logs('$c_log', NULL, 100)")"
assert_eq '3. chamada de 1a pagina (campanha, NULL, limite) segue valendo' '5' "$doc_first"

# 4) a assinatura antiga foi removida: nao sobra overload que ainda perderia linhas
old_sig="$(psql_val "SELECT to_regprocedure('public.talkx_campaign_logs(uuid,timestamptz,integer)') IS NULL")"
assert_eq '4. assinatura antiga (uuid,timestamptz,integer) nao existe mais' 't' "$old_sig"
new_sig="$(psql_val "SELECT to_regprocedure('public.talkx_campaign_logs(uuid,timestamptz,integer,uuid)') IS NOT NULL")"
assert_eq '4. assinatura nova (uuid,timestamptz,integer,uuid) existe' 't' "$new_sig"

# 5) ACL: PUBLIC/anon sem EXECUTE, authenticated/service_role com, agente barrado
pub_exec="$(psql_val "SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.talkx_campaign_logs(uuid,timestamptz,integer,uuid)'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'")"
assert_eq '5. PUBLIC sem EXECUTE' '0' "$pub_exec"
assert_eq '5. anon sem EXECUTE' 'f' "$(psql_val "SELECT has_function_privilege('anon', 'public.talkx_campaign_logs(uuid,timestamptz,integer,uuid)', 'EXECUTE')")"
assert_eq '5. authenticated com EXECUTE' 't' "$(psql_val "SELECT has_function_privilege('authenticated', 'public.talkx_campaign_logs(uuid,timestamptz,integer,uuid)', 'EXECUTE')")"
assert_eq '5. service_role com EXECUTE' 't' "$(psql_val "SELECT has_function_privilege('service_role', 'public.talkx_campaign_logs(uuid,timestamptz,integer,uuid)', 'EXECUTE')")"
agent_call="$(psql_raw "$agent_session SELECT count(*) FROM public.talkx_campaign_logs('$c_log', NULL, 100)")"
assert_has '5. agente nao-admin e barrado' 'talkx_admin_required' "$agent_call"
admin_call="$(psql_val "$admin_session SELECT count(*) FROM public.talkx_campaign_logs('$c_log', NULL, 100)")"
assert_eq '5. admin executa' '5' "$admin_call"

# 6) idempotencia: reaplicar a migration nao quebra
psql_exec < "$fix_migration" >/dev/null || fail 'migration do item 122 nao reaplicou (idempotencia)'
pass 'migration do item 122 reaplicada sem erro (idempotencia)'

# 7) o Rollback da linha 2 RODA e devolve a assinatura antiga
mkdir -p "$repo_root/.tmp"
sed -n '2p' "$fix_migration" | sed -e 's/^-- *[Rr]ollback: *//' > "$repo_root/.tmp/rollback-122.sql"
[[ -s "$repo_root/.tmp/rollback-122.sql" ]] || fail 'rollback da linha 2 nao encontrado'
psql_exec < "$repo_root/.tmp/rollback-122.sql" >/dev/null || fail 'o Rollback da linha 2 nao rodou'
rb_old="$(psql_val "SELECT to_regprocedure('public.talkx_campaign_logs(uuid,timestamptz,integer)') IS NOT NULL")"
assert_eq '7. rollback devolve a assinatura antiga' 't' "$rb_old"
rb_new="$(psql_val "SELECT to_regprocedure('public.talkx_campaign_logs(uuid,timestamptz,integer,uuid)') IS NULL")"
assert_eq '7. rollback remove a assinatura nova' 't' "$rb_new"
rb_acl="$(psql_val "SELECT has_function_privilege('anon', 'public.talkx_campaign_logs(uuid,timestamptz,integer)', 'EXECUTE')")"
assert_eq '7. rollback restaura o ACL (anon sem EXECUTE)' 'f' "$rb_acl"

echo '[OK] Item 122: cursor de log do Talk X passa a ser composto (created_at, id); a paginacao nao perde mais linhas empatadas e o cursor incompleto falha alto em vez de perder dados.'
