#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — M-DB-01 (= R3-DELTA-006/007).
#
# Prova, em PostgreSQL 17, que o tick do motor Talk X nao aborta mais no expurgo LGPD:
#   RED (estado vivo = X033, antes da migration):
#     - trigger_talkx_engine_tick() falha com 42501: o passo 5 do expurgo faz DELETE em
#       storage.objects e o gatilho FOR EACH STATEMENT storage.protect_delete levanta erro
#       mesmo com 0 linhas; last_purge_at continua nulo (gate diario sempre aberto);
#     - talkx_engine_alerts() falha no CHECK talkx_alerts_kind_check com outcome_unknown_24h.
#   GREEN (depois):
#     1. 1o tick roda, grava last_purge_at, registra o objeto orfao em
#        talkx_storage_purge_queue e NAO apaga nada em storage.objects;
#     2. 2o tick seguido e barrado pelo gate diario (nenhum evento de expurgo novo);
#     3. falha simulada no expurgo vira alerta purge_failed (+ last_purge_attempt_at) sem
#        abortar o tick; o expurgo que falhou nao grava last_purge_at;
#     4. tick seguinte dentro de 1 h NAO tenta de novo (failures continua 1);
#     5. talkx_engine_alerts() nao fecha purge_failed;
#     6. depois de 1 h e com a causa corrigida, o tick expurga e fecha purge_failed;
#     7. outcome_unknown_24h vira alerta outcome_unknown e nao pisca;
#     8. talkx_storage_purge_queue: RLS ligada, sem acesso para anon/authenticated;
#     9. idempotencia: reaplicar a migration nao quebra.
#
# O CI usa postgres puro (sem o schema storage do Supabase): a fixture cria storage.objects
# com o mesmo gatilho FOR EACH STATEMENT que levanta 42501, senao o RED passaria.
# As migrations sao achadas pelos marcadores internos 'talkx_x033_objetos_ausentes' (X033)
# e 'talkx_mdb01_objetos_ausentes' (esta). TALKX_MDB01_MIGRATION sobrepoe a segunda
# (usado no mutation test).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_migration() {
  grep -rlF "$1" "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true
}
x033="$(find_migration 'talkx_x033_objetos_ausentes')"
migration="${TALKX_MDB01_MIGRATION:-$(find_migration 'talkx_mdb01_objetos_ausentes')}"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

[[ -n "$x033" && -f "$x033" ]] || fail 'migration X033 nao encontrada (marcador talkx_x033_objetos_ausentes)'
[[ -n "$migration" && -f "$migration" ]] || fail 'migration M-DB-01 nao encontrada (marcador talkx_mdb01_objetos_ausentes)'

cid="talkx-mdb01-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-mdb01-[0-9]+$ ]]; then
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
pg_image="${TALKX_MDB01_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_mdb01_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

c_done='d0000000-0000-0000-0000-000000000001'
r_unknown='e0000000-0000-0000-0000-000000000001'

# ── fixtures (o suficiente para X033 + tick rodarem) ──────────────────────────
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
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
  sent_at timestamptz,
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
  clicked_at timestamptz NOT NULL DEFAULT now(),
  ua text,
  ip_hash text
);

-- Stub do Storage do Supabase: o gatilho de producao (storage.protect_delete, BEFORE DELETE
-- ... FOR EACH STATEMENT) levanta 42501 em todo DELETE direto, mesmo com 0 linhas.
CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  created_at timestamptz DEFAULT now()
);
CREATE FUNCTION storage.protect_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
    RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects
  FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

-- Stubs do pg_cron (sem execucoes) e do Vault (sem segredo => o tick nao chama net.http_post).
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text, active boolean NOT NULL DEFAULT true);
CREATE TABLE cron.job_run_details (jobid bigint, runid bigserial PRIMARY KEY, status text, return_message text, start_time timestamptz, end_time timestamptz);
INSERT INTO cron.job (jobname, schedule, command)
  VALUES ('talkx-scheduler-1min', '* * * * *', 'SELECT public.trigger_talkx_engine_tick()');
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret FROM vault.secrets;

CREATE FUNCTION public.get_talkx_cron_secret() RETURNS text LANGUAGE sql AS $$ SELECT 'segredo-de-teste'::text $$;
CREATE FUNCTION public.kick_talkx_campaign(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
CREATE FUNCTION public.sweep_talkx_stuck_recipients(p integer) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.complete_talkx_campaign_if_drained(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('last_purge_at', 'null'::jsonb, 'fixture'),
  ('retention_days_message', '180'::jsonb, 'fixture'),
  ('retention_days_clicks', '365'::jsonb, 'fixture'),
  ('retention_days_test_sends', '90'::jsonb, 'fixture'),
  ('retention_days_ai', '90'::jsonb, 'fixture');

-- Um objeto orfao vencido (vai para o manifesto) e um recente (fica fora).
INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
  ('talkx-media', 'campanhas/orfao-antigo.jpg', now() - interval '400 days'),
  ('talkx-media', 'campanhas/recente.jpg', now() - interval '1 day');
SQL

psql_exec < "$x033" >/dev/null || fail 'migration X033 (estado vivo) nao aplicou na fixture'
pass "estado vivo montado com X033 ($(basename "$x033"))"

psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, status, completed_at, updated_at)
  VALUES ('$c_done', 'Concluida', 'completed', now() - interval '1 hour', now() - interval '1 hour');
INSERT INTO public.talkx_recipients (id, campaign_id, status, updated_at)
  VALUES ('$r_unknown', '$c_done', 'outcome_unknown', now());
SQL

service_claim="SET request.jwt.claim.role = 'service_role';"
tick="SELECT public.trigger_talkx_engine_tick()"
purge_events="SELECT count(*) FROM public.talkx_campaign_events WHERE entity_type = 'talkx_lgpd_purge'"
last_purge="SELECT COALESCE(value #>> '{}', '<nulo>') FROM public.talkx_settings WHERE key = 'last_purge_at'"
open_purge_failed="SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL"

# ═════════════════════════════════════════════════════════════════════════════
# RED — estado vivo (X033): o tick aborta no expurgo
# ═════════════════════════════════════════════════════════════════════════════
red_tick="$(psql_raw "$tick")"
assert_has 'RED: o tick aborta no DELETE em storage.objects' 'Direct deletion from storage tables is not allowed' "$red_tick"
assert_eq 'RED: last_purge_at continua nulo (gate diario sempre aberto)' '<nulo>' "$(psql_val "$last_purge")"
red_alerts="$(psql_raw "$service_claim SELECT public.talkx_engine_alerts()")"
assert_has 'RED: talkx_engine_alerts() viola o CHECK com outcome_unknown_24h' 'talkx_alerts_kind_check' "$red_alerts"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration M-DB-01
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration M-DB-01 nao aplicou (GREEN)'
pass "migration M-DB-01 aplicada ($(basename "$migration"))"

# ── 1) primeiro tick: expurgo termina, grava last_purge_at, manifesto em vez de DELETE ──
first="$(psql_raw "$tick")"
assert_not_has '1. o 1o tick nao aborta' 'ERROR' "$first"
assert_eq '1. last_purge_at gravado' 'f' "$(psql_val "SELECT ((value #>> '{}') IS NULL)::text::char FROM public.talkx_settings WHERE key = 'last_purge_at'")"
assert_eq '1. 1 evento de expurgo' '1' "$(psql_val "$purge_events")"
assert_eq '1. objeto orfao vencido no manifesto' 'talkx-media/campanhas/orfao-antigo.jpg' \
  "$(psql_val "SELECT string_agg(bucket_id || '/' || object_name, ',') FROM public.talkx_storage_purge_queue WHERE processed_at IS NULL")"
assert_eq '1. nada apagado em storage.objects' '2' "$(psql_val "SELECT count(*) FROM storage.objects")"
assert_eq '1. nenhum purge_failed aberto' '0' "$(psql_val "$open_purge_failed")"

# ── 2) segundo tick seguido: barrado pelo gate diario ─────────────────────────
second="$(psql_raw "$tick")"
assert_not_has '2. o 2o tick nao aborta' 'ERROR' "$second"
assert_eq '2. gate diario barrou o 2o expurgo (continua 1 evento)' '1' "$(psql_val "$purge_events")"
assert_eq '2. manifesto sem duplicata' '1' "$(psql_val "SELECT count(*) FROM public.talkx_storage_purge_queue")"

# ── 3) falha simulada no expurgo: vira alerta purge_failed sem abortar o tick ──
psql_val "UPDATE public.talkx_settings SET value = to_jsonb((now() - interval '2 days')::text) WHERE key = 'last_purge_at'" >/dev/null
psql_val "UPDATE public.talkx_settings SET value = '\"nao-e-numero\"'::jsonb WHERE key = 'retention_days_message'" >/dev/null
before_fail="$(psql_val "$last_purge")"
third="$(psql_raw "$tick")"
assert_not_has '3. tick com expurgo falhando nao aborta' 'ERROR' "$third"
assert_eq '3. 1 alerta purge_failed aberto' '1' "$(psql_val "$open_purge_failed")"
assert_eq '3. alerta guarda o SQLSTATE da falha (22P02)' '22P02' \
  "$(psql_val "SELECT payload ->> 'sqlstate' FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL")"
assert_eq '3. last_purge_attempt_at gravado' '1' "$(psql_val "SELECT count(*) FROM public.talkx_settings WHERE key = 'last_purge_attempt_at' AND (value #>> '{}')::timestamptz > now() - interval '1 minute'")"
assert_eq '3. expurgo que falhou nao grava last_purge_at' "$before_fail" "$(psql_val "$last_purge")"

# ── 4) tick seguinte dentro de 1 h: nao tenta de novo ─────────────────────────
psql_raw "$tick" >/dev/null
assert_eq '4. dentro de 1 h nao ha nova tentativa (failures = 1)' '1' \
  "$(psql_val "SELECT payload ->> 'failures' FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL")"
psql_val "UPDATE public.talkx_settings SET value = to_jsonb((now() - interval '2 hours')::text) WHERE key = 'last_purge_attempt_at'" >/dev/null
psql_raw "$tick" >/dev/null
assert_eq '4. depois de 1 h tenta de novo e ainda falha (failures = 2, mesmo alerta)' '2|1' \
  "$(psql_val "SELECT (SELECT payload ->> 'failures' FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL) || '|' || (SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed')")"

# ── 5) talkx_engine_alerts() nao fecha purge_failed ───────────────────────────
alerts_out="$(psql_raw "$service_claim SELECT public.talkx_engine_alerts()")"
assert_not_has '5. talkx_engine_alerts() roda sem erro' 'ERROR' "$alerts_out"
assert_eq '5. purge_failed continua aberto depois da avaliacao de saude' '1' "$(psql_val "$open_purge_failed")"

# ── 6) causa corrigida + 1 h depois: expurgo roda e fecha o alerta ────────────
psql_val "UPDATE public.talkx_settings SET value = '180'::jsonb WHERE key = 'retention_days_message'" >/dev/null
psql_val "UPDATE public.talkx_settings SET value = to_jsonb((now() - interval '2 hours')::text) WHERE key = 'last_purge_attempt_at'" >/dev/null
psql_raw "$tick" >/dev/null
assert_eq '6. expurgo ok fecha purge_failed' '0' "$(psql_val "$open_purge_failed")"
assert_eq '6. expurgo ok grava evento novo' '2' "$(psql_val "$purge_events")"
assert_eq '6. last_purge_at e de hoje' 't' "$(psql_val "SELECT ((value #>> '{}')::timestamptz > now() - interval '1 minute')::text::char FROM public.talkx_settings WHERE key = 'last_purge_at'")"

# ── 7) outcome_unknown_24h vira alerta outcome_unknown e nao pisca ────────────
psql_val "$service_claim SELECT public.talkx_engine_alerts()" >/dev/null
again="$(psql_val "$service_claim SELECT public.talkx_engine_alerts()")"
assert_eq '7. alerta outcome_unknown aberto para a campanha' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'outcome_unknown' AND campaign_id = '$c_done' AND resolved_at IS NULL")"
assert_has '7. segunda avaliacao nao fecha o outcome_unknown (sem piscar)' '"resolved": 0' "$again"
assert_eq '7. um unico alerta outcome_unknown no historico' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'outcome_unknown'")"

# ── 8) manifesto: RLS ligada e so service_role ────────────────────────────────
assert_eq '8. RLS ligada em talkx_storage_purge_queue' 't' "$(psql_val "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.talkx_storage_purge_queue'::regclass")"
for r in anon authenticated; do
  assert_eq "8. $r sem SELECT no manifesto" 'f' "$(psql_val "SELECT has_table_privilege('$r', 'public.talkx_storage_purge_queue', 'SELECT')")"
  assert_eq "8. $r sem INSERT no manifesto" 'f' "$(psql_val "SELECT has_table_privilege('$r', 'public.talkx_storage_purge_queue', 'INSERT')")"
done
assert_eq '8. service_role com DELETE no manifesto' 't' "$(psql_val "SELECT has_table_privilege('service_role', 'public.talkx_storage_purge_queue', 'DELETE')")"
for fn in 'public.talkx_engine_alerts()' 'public.purge_talkx_expired_data(integer)' 'public.trigger_talkx_engine_tick()'; do
  assert_eq "8. search_path fixo em $fn" 'search_path=public, pg_temp' \
    "$(psql_val "SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = '$fn'::regprocedure")"
  assert_eq "8. authenticated sem EXECUTE em $fn" 'f' "$(psql_val "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")"
done

# ── 9) idempotencia ───────────────────────────────────────────────────────────
psql_exec < "$migration" >/dev/null || fail 'migration M-DB-01 nao reaplicou (idempotencia)'
pass 'migration M-DB-01 reaplicada sem erro (idempotencia)'

echo '[OK] Talk X M-DB-01: tick nao aborta no expurgo (manifesto em vez de DELETE em storage.objects, purge_failed com espera de 1 h, gate diario volta a valer, outcome_unknown alinhado ao CHECK).'
