#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — M-DB-01 (= R3-DELTA-006/007).
#
# O tick do motor Talk X (trigger_talkx_engine_tick) abortava inteiro porque o expurgo LGPD
# (purge_talkx_expired_data, passo 5 do X033) fazia DELETE FROM storage.objects, e o gatilho
# storage.protect_delete (BEFORE DELETE ... FOR EACH STATEMENT) levanta 42501 mesmo com 0 linhas.
# O CI usa postgres puro, sem o schema storage do Supabase: a fixture recria storage.objects com
# um gatilho FOR EACH STATEMENT que levanta 42501, senao o RED passaria antes da correcao.
#
#   RED (so a X033, que espelha a producao):
#     - o tick falha com 42501 e last_purge_at fica nulo;
#     - talkx_engine_alerts() viola talkx_alerts_kind_check com o sinal outcome_unknown_24h.
#   GREEN (X033 + migration M-DB-01):
#     1. manifesto talkx_storage_purge_queue com RLS e acesso so service_role; CHECK com
#        purge_failed; as 3 funcoes com search_path = public, pg_temp;
#     2. 1o tick passa, grava last_purge_at, NAO apaga storage.objects e enfileira so o orfao;
#     3. 2o tick seguido e barrado pelo gate diario (sem evento novo, last_purge_at igual);
#     4. falha simulada no expurgo vira alerta purge_failed sem abortar o tick e grava
#        last_purge_attempt_at;
#     5. talkx_engine_alerts() NAO fecha o purge_failed (sem alerta piscando);
#     6. tick dentro de 1 h nao tenta o expurgo de novo;
#     7. depois de 1 h o expurgo roda, grava last_purge_at, fecha o purge_failed e nao
#        reenfileira o orfao ja pendente;
#     8. outcome_unknown_24h vira alerta outcome_unknown e continua aberto na chamada seguinte;
#     9. ACL das funcoes e reaplicacao da migration (idempotencia).
#
# A migration e encontrada pelo marcador interno 'talkx_mdb01_objetos_ausentes'; a base pelo
# marcador da X033. TALKX_MDB01_MIGRATION aponta para outro arquivo (mutation test).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

base_migration="$(grep -rlF 'talkx_x033_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$base_migration" && -f "$base_migration" ]] || fail 'migration X033 nao encontrada (marcador talkx_x033_objetos_ausentes)'
migration="${TALKX_MDB01_MIGRATION:-$(grep -rlF 'talkx_mdb01_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)}"
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
psql_raw()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -v VERBOSITY=verbose -U postgres -d postgres -c "$1" 2>&1 || true; }

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
  [[ "$actual" != *"$pattern"* ]] || fail "$label: NAO deveria conter '$pattern', obtido -> $actual"
  pass "$label"
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

c_media='d0000000-0000-0000-0000-000000000010'
c_unknown='d0000000-0000-0000-0000-000000000020'
r_unknown='e0000000-0000-0000-0000-000000000020'

# ── fixtures: o minimo para a X033, o tick e o expurgo rodarem ────────────────
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

-- Storage do Supabase: storage.protect_delete recusa DELETE direto, por instrucao, mesmo com 0 linhas.
CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION storage.protect_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
    USING ERRCODE = '42501';
END $$;
CREATE TRIGGER protect_objects_delete
  BEFORE DELETE ON storage.objects
  FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

-- Stubs do pg_cron, do Vault (sem segredo: o tick nao chega ao net.http_post) e do motor.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text);
CREATE TABLE cron.job_run_details (
  jobid bigint, runid bigserial PRIMARY KEY, status text, return_message text,
  start_time timestamptz, end_time timestamptz
);
INSERT INTO cron.job (jobname, schedule, command)
  VALUES ('talkx-scheduler-1min', '* * * * *', 'SELECT public.trigger_talkx_engine_tick()');
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret FROM vault.secrets;

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
  ('retention_days_ai', '90'::jsonb, 'fixture');
SQL

# 3 objetos em talkx-media: 1 orfao vencido (vai para o manifesto), 1 vencido em uso por campanha
# e 1 recente (ficam fora).
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, status, media_url, completed_at)
  VALUES ('$c_media', 'Com midia', 'completed', 'https://exemplo.invalid/storage/v1/object/public/talkx-media/em-uso.png', now() - interval '1 day');
INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
  ('talkx-media', 'orfao.png',  now() - interval '200 days'),
  ('talkx-media', 'em-uso.png', now() - interval '200 days'),
  ('talkx-media', 'recente.png', now() - interval '1 day');
INSERT INTO public.talkx_campaigns (id, name, status, completed_at)
  VALUES ('$c_unknown', 'Resultado incerto', 'completed', now());
INSERT INTO public.talkx_recipients (id, campaign_id, status, updated_at)
  VALUES ('$r_unknown', '$c_unknown', 'outcome_unknown', now());
SQL

tick="SET ROLE service_role; SELECT public.trigger_talkx_engine_tick();"
service_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role';"
setting() { psql_val "SELECT COALESCE(value #>> '{}', '<nulo>') FROM public.talkx_settings WHERE key = '$1'"; }

# ═════════════════════════════════════════════════════════════════════════════
# RED — so a X033 (estado da producao): o expurgo derruba o tick
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$base_migration" >/dev/null || fail 'migration X033 (base) nao aplicou'
pass "base X033 aplicada ($(basename "$base_migration"))"

red_tick="$(psql_raw "$tick")"
assert_has 'RED: o tick aborta no DELETE de storage.objects' 'Direct deletion from storage tables is not allowed' "$red_tick"
assert_has 'RED: o erro e 42501' '42501' "$red_tick"
assert_eq 'RED: last_purge_at continua nulo (gate diario sempre aberto)' '<nulo>' "$(setting last_purge_at)"
red_alerts="$(psql_raw "$service_session SELECT public.talkx_engine_alerts()")"
assert_has 'RED: talkx_engine_alerts viola o CHECK com outcome_unknown_24h' 'talkx_alerts_kind_check' "$red_alerts"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration M-DB-01
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration M-DB-01 nao aplicou (GREEN)'
pass "migration M-DB-01 aplicada ($(basename "$migration"))"

# ── 1) objetos, RLS, ACL e search_path ───────────────────────────────────────
assert_eq '1. manifesto talkx_storage_purge_queue com RLS' 't' \
  "$(psql_val "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.talkx_storage_purge_queue'::regclass")"
for r in anon authenticated; do
  assert_eq "1. $r sem acesso ao manifesto" 'f' \
    "$(psql_val "SELECT has_table_privilege('$r', 'public.talkx_storage_purge_queue', 'SELECT') OR has_table_privilege('$r', 'public.talkx_storage_purge_queue', 'INSERT')")"
done
assert_eq '1. service_role le e escreve o manifesto' 't' \
  "$(psql_val "SELECT has_table_privilege('service_role', 'public.talkx_storage_purge_queue', 'SELECT') AND has_table_privilege('service_role', 'public.talkx_storage_purge_queue', 'INSERT,UPDATE,DELETE')")"
assert_has '1. CHECK de talkx_alerts aceita purge_failed' 'purge_failed' \
  "$(psql_val "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'talkx_alerts_kind_check'")"
for fn in 'public.talkx_engine_alerts()' 'public.purge_talkx_expired_data(integer)' 'public.trigger_talkx_engine_tick()'; do
  assert_eq "1. search_path de $fn" 'search_path=public, pg_temp' \
    "$(psql_val "SELECT array_to_string(proconfig, ';') FROM pg_proc WHERE oid = '$fn'::regprocedure")"
done
assert_eq '1. o expurgo nao usa storage.allow_delete_query' '0' \
  "$(psql_val "SELECT count(*) FROM pg_proc WHERE oid = 'public.purge_talkx_expired_data(integer)'::regprocedure AND prosrc LIKE '%allow_delete_query%'")"

# ── 2) 1o tick: passa, grava last_purge_at, enfileira so o orfao ─────────────
psql_val "$tick" >/dev/null || fail '2. o 1o tick deveria passar depois da correcao'
pass '2. 1o tick passa com storage.protect_delete ativo'
first_purge="$(setting last_purge_at)"
[[ "$first_purge" != '<nulo>' ]] || fail '2. o 1o tick deveria gravar last_purge_at'
pass "2. 1o tick gravou last_purge_at ($first_purge)"
assert_eq '2. nenhum objeto apagado em storage.objects' '3' "$(psql_val "SELECT count(*) FROM storage.objects")"
assert_eq '2. manifesto tem so o orfao vencido' 'talkx-media/orfao.png' \
  "$(psql_val "SELECT string_agg(bucket_id || '/' || object_name, ',') FROM public.talkx_storage_purge_queue WHERE processed_at IS NULL")"
assert_eq '2. evento do expurgo gravado' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE entity_type = 'talkx_lgpd_purge'")"
assert_has '2. evento conta 1 objeto enfileirado' '"media": 1' \
  "$(psql_val "SELECT message FROM public.talkx_campaign_events WHERE entity_type = 'talkx_lgpd_purge'")"

# ── 3) 2o tick seguido: barrado pelo gate diario ─────────────────────────────
psql_val "$tick" >/dev/null || fail '3. o 2o tick deveria passar'
assert_eq '3. 2o tick nao muda last_purge_at' "$first_purge" "$(setting last_purge_at)"
assert_eq '3. 2o tick nao grava evento novo (gate diario)' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE entity_type = 'talkx_lgpd_purge'")"

# ── 4) falha simulada no expurgo vira purge_failed sem abortar o tick ────────
psql_val "UPDATE public.talkx_settings SET value = 'null'::jsonb WHERE key = 'last_purge_at'" >/dev/null
psql_val "UPDATE public.talkx_settings SET value = '\"nao-e-numero\"'::jsonb WHERE key = 'retention_days_message'" >/dev/null
psql_val "$tick" >/dev/null || fail '4. o tick NAO pode abortar quando o expurgo falha'
pass '4. tick passa com o expurgo falhando'
assert_eq '4. 1 alerta purge_failed aberto' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL")"
assert_eq '4. alerta guarda o SQLSTATE da falha' '22P02' \
  "$(psql_val "SELECT payload->>'sqlstate' FROM public.talkx_alerts WHERE kind = 'purge_failed'")"
attempt_at="$(setting last_purge_attempt_at)"
[[ "$attempt_at" != '<nulo>' && -n "$attempt_at" ]] || fail '4. last_purge_attempt_at deveria ser gravado'
pass "4. last_purge_attempt_at gravado ($attempt_at)"
assert_eq '4. last_purge_at continua nulo (expurgo revertido)' '<nulo>' "$(setting last_purge_at)"

# ── 5) talkx_engine_alerts nao fecha purge_failed ────────────────────────────
psql_val "$service_session SELECT public.talkx_engine_alerts()" >/dev/null || fail '5. talkx_engine_alerts deveria passar'
psql_val "$service_session SELECT public.talkx_engine_alerts()" >/dev/null || fail '5. talkx_engine_alerts deveria passar'
assert_eq '5. purge_failed continua aberto depois dos alertas de 5 min' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL")"
assert_eq '5. sem alerta purge_failed piscando (1 linha so)' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed'")"

# ── 6) dentro de 1 h o tick nao tenta o expurgo de novo ──────────────────────
psql_val "$tick" >/dev/null || fail '6. o tick deveria passar'
assert_eq '6. last_purge_attempt_at inalterado (sem nova tentativa em 1 h)' "$attempt_at" "$(setting last_purge_attempt_at)"
assert_eq '6. nenhum alerta purge_failed novo' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed'")"

# ── 7) depois de 1 h o expurgo roda e fecha o alerta ─────────────────────────
psql_val "UPDATE public.talkx_settings SET value = '180'::jsonb WHERE key = 'retention_days_message'" >/dev/null
psql_val "UPDATE public.talkx_settings SET value = to_jsonb((now() - interval '2 hours')::text) WHERE key = 'last_purge_attempt_at'" >/dev/null
psql_val "$tick" >/dev/null || fail '7. o tick deveria passar'
[[ "$(setting last_purge_at)" != '<nulo>' ]] || fail '7. o expurgo deveria rodar e gravar last_purge_at'
pass '7. depois de 1 h o expurgo roda e grava last_purge_at'
assert_eq '7. purge_failed fechado pelo expurgo bem-sucedido' '0' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'purge_failed' AND resolved_at IS NULL")"
assert_eq '7. orfao ja pendente nao e reenfileirado' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_storage_purge_queue")"
assert_eq '7. storage.objects intacto' '3' "$(psql_val "SELECT count(*) FROM storage.objects")"

# ── 8) outcome_unknown_24h vira alerta outcome_unknown, sem piscar ───────────
first_alerts="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_not_has '8. talkx_engine_alerts sem violacao de CHECK' 'violates' "$first_alerts"
assert_eq '8. alerta outcome_unknown aberto para a campanha' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'outcome_unknown' AND campaign_id = '$c_unknown' AND resolved_at IS NULL")"
second_alerts="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has '8. chamada seguinte nao fecha o outcome_unknown' '"resolved": 0' "$second_alerts"
assert_eq '8. continua 1 alerta outcome_unknown (sem piscar)' '1' \
  "$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind = 'outcome_unknown'")"

# ── 9) ACL das funcoes e idempotencia ────────────────────────────────────────
for fn in 'public.talkx_engine_alerts()' 'public.purge_talkx_expired_data(integer)' 'public.trigger_talkx_engine_tick()'; do
  assert_eq "9. authenticated sem EXECUTE em $fn" 'f' "$(psql_val "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")"
  assert_eq "9. anon sem EXECUTE em $fn" 'f' "$(psql_val "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")"
  assert_eq "9. service_role com EXECUTE em $fn" 't' "$(psql_val "SELECT has_function_privilege('service_role', '$fn', 'EXECUTE')")"
done
psql_exec < "$migration" >/dev/null || fail '9. migration M-DB-01 nao reaplicou (idempotencia)'
pass '9. migration M-DB-01 reaplicada sem erro (idempotencia)'

echo '[OK] Talk X M-DB-01: o tick nao aborta no expurgo (storage.objects via manifesto, falha vira purge_failed com nova tentativa em 1 h) e o kind outcome_unknown foi alinhado.'
