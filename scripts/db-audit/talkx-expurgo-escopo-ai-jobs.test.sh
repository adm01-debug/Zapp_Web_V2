#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — #130 (R3-DELTA-015).
#
# Prova, em PostgreSQL 17, que o expurgo LGPD do Talk X NAO apaga ai_jobs de outros
# modulos. `ai_jobs` e a fila DURAVEL COMPARTILHADA (IA-045): a IA enfileira
# 'ai.generate' e o inbox (message-delivery) enfileira 'reconcile:message.send:<id>'.
# O expurgo do Talk X filtrava so por status terminal + idade e levava o trabalho
# desses outros modulos junto.
#
# RED (estado vivo = M-DB-01, 20261004173439): um expurgo apaga os jobs terminais
#   vencidos de OUTROS modulos ('reconcile:message.send:<id>' e 'ai.generate'), e a
#   contagem 'ai' do retorno soma os jobs alheios.
# GREEN (depois da migration do #130):
#   1. os jobs terminais vencidos de OUTROS modulos seguem INTACTOS;
#   2. o job terminal vencido do PROPRIO Talk X ('reconcile:talkx.recipient.send:<id>')
#      continua sendo apagado, e a contagem 'ai' conta so ele;
#   3. job do Talk X recente (dentro do prazo) e nao-terminal (running) ficam;
#   4. ACL intacta (service_role executa; anon/authenticated nao) e search_path fixo;
#   5. rollback: a linha '-- Rollback:' da propria migration volta o corpo anterior
#      (sem o filtro de escopo) e a descricao antiga do setting;
#   6. idempotencia: reaplicar a migration nao quebra.
#
# As migrations sao achadas pelos marcadores internos 'talkx_mdb01_objetos_ausentes'
# (estado vivo) e 'talkx_purge_escopo_ai_jobs_ausente' (esta). Ambas sao os arquivos
# REAIS de supabase/migrations/.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_migration() {
  grep -rlF "$1" "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true
}
mdb01="$(find_migration 'talkx_mdb01_objetos_ausentes')"
migration="$(find_migration 'talkx_purge_escopo_ai_jobs_ausente')"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

[[ -n "$mdb01" && -f "$mdb01" ]] || fail 'migration M-DB-01 nao encontrada (marcador talkx_mdb01_objetos_ausentes)'
[[ -n "$migration" && -f "$migration" ]] || fail 'migration do #130 nao encontrada (marcador talkx_purge_escopo_ai_jobs_ausente)'

cid="talkx-escopo-ai-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-escopo-ai-[0-9]+$ ]]; then
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
assert_not_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" != *"$pattern"* ]] || fail "$label: nao esperava '$pattern', obtido -> $actual"
  pass "$label (sem '$pattern')"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${TALKX_ESCOPO_AI_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_escopo_ai_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── fixtures: o suficiente para a M-DB-01 e o expurgo rodarem ─────────────────
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

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  status text NOT NULL DEFAULT 'draft',
  media_url text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_campaign_events_target_check CHECK (
    (campaign_id IS NOT NULL) <> (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clicked_at timestamptz NOT NULL DEFAULT now(),
  ua text,
  ip_hash text
);

CREATE TABLE public.talkx_test_send_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  campaign_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- A fila COMPARTILHADA, com as colunas reais que o expurgo/estado usam.
CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  function_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','partial','succeeded','failed','cancelled','outcome_unknown')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('last_purge_at', 'null'::jsonb, 'fixture'),
  ('retention_days_message', '180'::jsonb, 'fixture'),
  ('retention_days_clicks', '365'::jsonb, 'fixture'),
  ('retention_days_test_sends', '90'::jsonb, 'fixture'),
  ('retention_days_ai', '90'::jsonb, 'X032: dias de retencao de linhas terminais de IA (ai_jobs).');
SQL

psql_exec < "$mdb01" >/dev/null || fail 'migration M-DB-01 (estado vivo) nao aplicou na fixture'
pass "estado vivo montado com a M-DB-01 ($(basename "$mdb01"))"

service_session="SET request.jwt.claim.role = 'service_role';"
daily_gate_off="UPDATE public.talkx_settings SET value = 'null'::jsonb WHERE key = 'last_purge_at'"
scope_in_def="SELECT (position('reconcile:talkx.%' IN pg_get_functiondef('public.purge_talkx_expired_data(integer)'::regprocedure)) > 0)::text"

# Os ids de idempotencia (chave estavel de cada modulo; ver
# supabase/functions/_shared/effect-reconcile.ts e ai-jobs-worker).
k_msg_send='reconcile:message.send:11111111-1111-1111-1111-111111111111'
k_ai_gen='ai.generate:22222222-2222-2222-2222-222222222222'
k_talkx_old='reconcile:talkx.recipient.send:33333333-3333-3333-3333-333333333333'
k_talkx_recent='reconcile:talkx.recipient.send:44444444-4444-4444-4444-444444444444'
k_talkx_running='reconcile:talkx.recipient.send:55555555-5555-5555-5555-555555555555'
k_msg_recent='reconcile:message.send:66666666-6666-6666-6666-666666666666'

seed_jobs() {
  psql_exec >/dev/null <<SQL
DELETE FROM public.ai_jobs;
INSERT INTO public.ai_jobs (idempotency_key, kind, function_name, status, created_at, finished_at) VALUES
  ('$k_msg_send',      'effect.reconcile', 'ai-jobs-worker', 'succeeded', now() - interval '100 days', now() - interval '100 days'),
  ('$k_ai_gen',        'ai.generate',      'ai-jobs-worker', 'succeeded', now() - interval '100 days', now() - interval '100 days'),
  ('$k_talkx_old',     'effect.reconcile', 'ai-jobs-worker', 'succeeded', now() - interval '100 days', now() - interval '100 days'),
  ('$k_talkx_recent',  'effect.reconcile', 'ai-jobs-worker', 'succeeded', now() - interval '5 days',   now() - interval '5 days'),
  ('$k_talkx_running', 'effect.reconcile', 'ai-jobs-worker', 'running',   now() - interval '100 days', NULL),
  ('$k_msg_recent',    'effect.reconcile', 'ai-jobs-worker', 'succeeded', now() - interval '5 days',   now() - interval '5 days');
SQL
}

# ═════════════════════════════════════════════════════════════════════════════
# RED — estado vivo (M-DB-01): o expurgo do Talk X apaga ai_jobs de outros modulos
# ═════════════════════════════════════════════════════════════════════════════
seed_jobs
psql_val "$daily_gate_off" >/dev/null
red="$(psql_val "$service_session SELECT public.purge_talkx_expired_data(1000)")"
assert_not_has 'RED: o expurgo roda' 'ERROR' "$red"
assert_has 'RED: contagem ai soma TAMBEM os jobs de outros modulos' '"ai": 3,' "$red"
assert_eq 'RED (defeito): job do inbox (reconcile:message.send) vencido foi APAGADO' '0' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_msg_send'")"
assert_eq 'RED (defeito): job de IA (ai.generate) vencido foi APAGADO' '0' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_ai_gen'")"
assert_eq 'RED: job do Talk X vencido tambem sai' '0' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_talkx_old'")"
assert_eq 'RED: job do Talk X recente fica' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_talkx_recent'")"
assert_eq 'RED: job do Talk X nao-terminal fica' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_talkx_running'")"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration do #130
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration do #130 nao aplicou (GREEN)'
pass "migration do #130 aplicada ($(basename "$migration"))"

assert_eq '0. o corpo da funcao passa a ter o escopo' 'true' "$(psql_val "$scope_in_def")"
assert_eq '0. descricao do setting passa a declarar o escopo' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_settings WHERE key = 'retention_days_ai' AND description LIKE '%#130%'")"

seed_jobs
psql_val "$daily_gate_off" >/dev/null
green="$(psql_val "$service_session SELECT public.purge_talkx_expired_data(1000)")"
assert_not_has '1. o expurgo roda' 'ERROR' "$green"

# ── 1) jobs de OUTROS modulos ficam intactos ─────────────────────────────────
assert_eq '1. job do inbox (reconcile:message.send) vencido SOBREVIVE' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_msg_send'")"
assert_eq '1. job de IA (ai.generate) vencido SOBREVIVE' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_ai_gen'")"
assert_eq '1. job do outro modulo recente tambem sobrevive' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_msg_recent'")"
assert_has '1. contagem ai conta SOMENTE o job do Talk X (1)' '"ai": 1,' "$green"

# ── 2) o job do PROPRIO Talk X continua sendo expurgado ──────────────────────
assert_eq '2. job do Talk X vencido e apagado' '0' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_talkx_old'")"
assert_eq '2. job do Talk X recente fica' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_talkx_recent'")"
assert_eq '2. job do Talk X nao-terminal fica' '1' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE idempotency_key = '$k_talkx_running'")"
assert_eq '2. total de linhas em ai_jobs apos o expurgo (5 de 6)' '5' \
  "$(psql_val "SELECT count(*) FROM public.ai_jobs")"

# ── 3) ACL e contrato da funcao intactos (papeis reais) ─────────────────────
assert_eq '3. service_role executa o expurgo' 't' \
  "$(psql_val "SELECT has_function_privilege('service_role', 'public.purge_talkx_expired_data(integer)', 'EXECUTE')")"
for r in anon authenticated; do
  assert_eq "3. $r NAO executa o expurgo" 'f' \
    "$(psql_val "SELECT has_function_privilege('$r', 'public.purge_talkx_expired_data(integer)', 'EXECUTE')")"
done
assert_eq '3. search_path fixo' 'search_path=public, pg_temp' \
  "$(psql_val "SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = 'public.purge_talkx_expired_data(integer)'::regprocedure")"
denied="$(psql_raw "SET ROLE authenticated; SELECT public.purge_talkx_expired_data(10);")"
assert_has '3. authenticated levando SET ROLE e barrado na porta' 'permission denied' "$denied"

# ── 4) rollback: a propria linha '-- Rollback:' da migration volta o corpo anterior
rb="$(grep '^-- Rollback:' "$migration" | cut -d' ' -f3-)"
[[ -n "$rb" ]] || fail 'a migration nao tem a linha -- Rollback:'
printf '%s\n' "$rb" | psql_exec >/dev/null || fail 'o rollback da migration nao executou'
assert_eq '4. rollback: o escopo sai do corpo da funcao' 'false' "$(psql_val "$scope_in_def")"
assert_eq '4. rollback: a descricao antiga do setting volta' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_settings WHERE key = 'retention_days_ai' AND description = 'X032: dias de retencao de linhas terminais de IA (ai_jobs).'")"

# ── 5) idempotencia: reaplicar a migration fecha de novo ─────────────────────
psql_exec < "$migration" >/dev/null || fail 'migration do #130 nao reaplicou (idempotencia)'
assert_eq '5. reaplicada: escopo de volta no corpo' 'true' "$(psql_val "$scope_in_def")"
pass 'migration do #130 reaplicada sem erro (idempotencia)'

echo '[OK] Talk X #130: o expurgo LGPD deixa intactos os ai_jobs de outros modulos (inbox/IA) e continua apagando apenas os jobs terminais vencidos do proprio Talk X.'
