#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — item 33 / R3-OBS-001 (R3-DELTA-001).
#
# Prova, em PostgreSQL 17, com as MIGRATIONS REAIS aplicadas por marcador interno, que a
# divergencia entre o SINAL da view ('outcome_unknown_24h') e o CHECK de talkx_alerts
# ('outcome_unknown') derrubava o LOTE INTEIRO de alertas — e que ele ja foi alinhado.
#
#   RED (estado vivo = X033, sem o fix):
#     - talkx_engine_alerts() estoura 'talkx_alerts_kind_check' porque leva
#       'outcome_unknown_24h' cru ao INSERT; como e um unico INSERT..SELECT, a violacao
#       aborta a gravacao de TODOS os alertas da rodada — inclusive um stalled_campaign que
#       estava presente no MESMO processamento. Nenhum alerta e aberto.
#   GREEN (com a migration do fix, M-DB-01):
#     - o sinal 'outcome_unknown_24h' e traduzido para 'outcome_unknown' antes do INSERT e
#       da comparacao de fechamento; os DOIS alertas da mesma rodada sao abertos;
#     - 2a rodada nao duplica (dedup) e nao fecha o que continua disparando (sem piscar);
#     - quando os sinais deixam de disparar, os dois alertas sao resolvidos sozinhos.
#
# Roda como o PAPEL REAL: as funcoes checam auth.role() = 'service_role'; o harness liga
# request.jwt.claim.role na mesma sessao. Nao usa o banco real; Postgres descartavel.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_migration() {
  grep -rlF "$1" "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true
}
x033="$(find_migration 'talkx_x033_objetos_ausentes')"
fix="$(find_migration 'talkx_mdb01_objetos_ausentes')"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

[[ -n "$x033" && -f "$x033" ]] || fail 'migration X033 nao encontrada (marcador talkx_x033_objetos_ausentes)'
[[ -n "$fix" && -f "$fix" ]] || fail 'migration do fix nao encontrada (marcador talkx_mdb01_objetos_ausentes)'

cid="talkx-lote-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-lote-[0-9]+$ ]]; then
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
pg_image="${TALKX_LOTE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_lote_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

c_unknown='f0000000-0000-0000-0000-000000000001'
c_stall='f0000000-0000-0000-0000-000000000002'
r_unknown='f0000000-0000-0000-0000-0000000000a1'

# ── fixtures (o suficiente para X033 + talkx_engine_alerts roda) ──────────────
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

CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT _uid = 'a0000000-0000-0000-0000-000000000001'::uuid $$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  status text NOT NULL DEFAULT 'draft',
  whatsapp_connection_id uuid,
  media_url text,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivery_claim_expires_at timestamptz,
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
SQL

psql_exec < "$x033" >/dev/null || fail 'migration X033 (estado vivo) nao aplicou na fixture'
pass "estado vivo montado com X033 ($(basename "$x033"))"

# Dois sinais na MESMA rodada: um outcome_unknown recente e um stalled_campaign.
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, status, updated_at) VALUES
  ('$c_unknown', 'Concluida com outcome_unknown', 'completed', now()),
  ('$c_stall',   'Travada', 'sending', now() - interval '40 minutes');
INSERT INTO public.talkx_recipients (id, campaign_id, status, updated_at)
  VALUES ('$r_unknown', '$c_unknown', 'outcome_unknown', now());
SQL

service_claim="SET request.jwt.claim.role = 'service_role';"
alerts_call='public.talkx_engine_alerts()'
open_kinds="SELECT COALESCE(string_agg(kind, ',' ORDER BY kind), '<nenhum>') FROM public.talkx_alerts WHERE resolved_at IS NULL"

# ═══════════════════════════════════════════════════════════════════════════
# RED — estado vivo (X033): o LOTE inteiro de alertas nao grava
# ═══════════════════════════════════════════════════════════════════════════
red="$(psql_raw "$service_claim SELECT $alerts_call")"
assert_has   'RED: talkx_engine_alerts() viola o CHECK com outcome_unknown_24h' 'talkx_alerts_kind_check' "$red"
assert_eq    'RED: o lote nao gravou NENHUM alerta (nem o stalled_campaign da mesma rodada)' '<nenhum>' "$(psql_val "$open_kinds")"

# ═══════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration do fix
# ═══════════════════════════════════════════════════════════════════════════
psql_exec < "$fix" >/dev/null || fail 'migration do fix nao aplicou (GREEN)'
pass "migration do fix aplicada ($(basename "$fix"))"

first="$(psql_raw "$service_claim SELECT $alerts_call")"
assert_not_has 'GREEN: a avaliacao de alertas roda sem erro' 'ERROR' "$first"
assert_eq 'GREEN: os DOIS alertas da mesma rodada abriram' 'outcome_unknown,stalled_campaign' "$(psql_val "$open_kinds")"
assert_eq 'GREEN: o alerta usa o kind canonico outcome_unknown (nao o sinal da view)' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'outcome_unknown' AND campaign_id = '$c_unknown' AND resolved_at IS NULL")"
assert_eq 'GREEN: nenhum alerta com o kind cru outcome_unknown_24h' '0' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'outcome_unknown_24h'")"
assert_has 'GREEN: a rodada reporta 2 abertos' '"opened": 2' "$first"

# ── dedup e nao-piscar: 2a rodada com os mesmos sinais ───────────────────────
second="$(psql_raw "$service_claim SELECT $alerts_call")"
assert_eq 'GREEN: 2a rodada nao duplica (2 abertos no total)' '2' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE resolved_at IS NULL")"
assert_has 'GREEN: 2a rodada nao fecha o que continua disparando' '"resolved": 0' "$second"
assert_eq 'GREEN: historico tem um unico alerta por (tipo, campanha)' '2' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts")"

# ── resolucao automatica: os sinais param de disparar ────────────────────────
psql_val "UPDATE public.talkx_campaigns SET status = 'paused' WHERE id = '$c_stall'" >/dev/null
psql_val "UPDATE public.talkx_recipients SET updated_at = now() - interval '25 hours' WHERE id = '$r_unknown'" >/dev/null
third="$(psql_raw "$service_claim SELECT $alerts_call")"
assert_not_has 'GREEN: a rodada de resolucao roda sem erro' 'ERROR' "$third"
assert_eq 'GREEN: os dois alertas foram resolvidos sozinhos' '<nenhum>' "$(psql_val "$open_kinds")"
assert_eq 'GREEN: ambos ficaram com resolved_at preenchido' '2' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE resolved_at IS NOT NULL")"

echo '[OK] Talk X item 33: o lote de alertas nao trava mais no sinal outcome_unknown_24h; o sinal vira alerta outcome_unknown (dedup, sem piscar) e resolve quando o sinal para.'
