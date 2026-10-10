#!/usr/bin/env bash
# X012 (Fase 2 · Tela motor · banco + cron): o tick do motor — reaper, conclusão,
# re-invocação (fan-out 1-por-conexão) e cron com segredo e timeout.
#
# Contrato num PostgreSQL 17 descartável, no mesmo formato dos testes irmãos
# scripts/db-audit/talkx-campaign-worker-lease.test.sh (X010) e
# scripts/db-audit/talkx-delivery-leases.test.sh.
#
# Prova, contra a MIGRATION REAL do repo (20261001391230), sobre um schema mínimo
# com as colunas que as RPCs tocam, e com duas dependências já mergeadas aplicadas
# de verdade (20261001311230 = X010; 20260911170000 = conclusão):
#   (a) destinatário 'sending' com provider_dispatch_started_at e lease vencido →
#       sweep_talkx_stuck_recipients() devolve 1, vira 'outcome_unknown' e o
#       outcome_unknown_count da campanha sobe para 1;
#   (b) campanha 'sending' sem nenhum pending/sending → o tick vira 'completed';
#   (c) 3 campanhas 'sending' em 2 conexões (2 em A, 1 em B) → o tick faz
#       exatamente 2 POSTs 'continue' (1 por conexão, o de A é o de updated_at
#       mais antigo), todos com header x-cron-secret, mais 1 POST para o
#       talkx-scheduler; o net.http_post é trocado por uma tabela de captura;
#   (d) o job existente 'talkx-scheduler-1min' passa a ter o command
#       'SELECT public.trigger_talkx_engine_tick()' (alter_job, sem job novo);
#   (e) authenticated chamando qualquer das 4 funções novas recebe 42501.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261001391230_talkx_engine_tick.sql"
prereq_worker_lease="$repo_root/supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql"
prereq_completion="$repo_root/supabase/migrations/20260911170000_add_talkx_campaign_completion_rpc.sql"
postgres_image="${TALKX_ENGINE_TICK_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-engine-tick-test-$$"
test_password="talkx_engine_tick_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle'"; }
  pass "$label"
}

start_postgres() {
  # GitHub-hosted runners can occasionally report PostgreSQL ready one instant
  # before its container restarts. Require two successful probes and retry only
  # the disposable bootstrap; a SQL/assertion failure is never retried.
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

campaign_reap='40000000-0000-0000-0000-0000000000a1'
campaign_drain='40000000-0000-0000-0000-0000000000a2'
campaign_conn_a_old='40000000-0000-0000-0000-0000000000a3'
campaign_conn_a_new='40000000-0000-0000-0000-0000000000a4'
campaign_conn_b='40000000-0000-0000-0000-0000000000a5'
recipient_reap='50000000-0000-0000-0000-000000000001'
contact_id='30000000-0000-0000-0000-000000000001'
send_url='https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/talkx-send'
scheduler_url='https://example.test/functions/v1/talkx-scheduler'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  message_template text NOT NULL DEFAULT '',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  media_url text,
  scheduled_at timestamptz,
  created_by uuid,
  started_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  completed_at timestamptz,
  whatsapp_connection_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  personalized_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  provider_dispatch_started_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.contacts (id uuid PRIMARY KEY, name text, nickname text, phone text, company text);
CREATE TABLE public.talkx_campaign_events (campaign_id uuid, event_type text, message text, actor_id uuid);

-- Stub fiel do Vault (a X010 cria talkx_cron_secret; a X012 cria talkx_send_url).
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE,
  description text, secret text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text, new_description text DEFAULT NULL)
  RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (new_name, new_secret, new_description)
    RETURNING id $$;

-- net.http_post trocado por uma tabela de captura: o teste mede os POSTs que o
-- tick dispararia, sem rede. Assinatura com os nomes que a migration usa
-- (url/body/headers/timeout_milliseconds), por argumento nomeado.
CREATE SCHEMA net;
CREATE TABLE net.http_capture (
  id bigserial PRIMARY KEY,
  url text,
  body jsonb,
  headers jsonb,
  timeout_milliseconds integer,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE sql VOLATILE AS $$
  INSERT INTO net.http_capture (url, body, headers, timeout_milliseconds)
  VALUES (url, body, headers, timeout_milliseconds)
  RETURNING id
$$;

-- Stub do pg_cron suficiente para provar o alter_job do job existente.
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION cron.alter_job(
  job_id bigint,
  schedule text DEFAULT NULL,
  command text DEFAULT NULL,
  database text DEFAULT NULL,
  username text DEFAULT NULL,
  active boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- alter_job do pg_cron só muda o que foi passado (jobid/active preservados).
  UPDATE cron.job
     SET schedule = COALESCE($2, cron.job.schedule),
         command  = COALESCE($3, cron.job.command),
         active   = COALESCE($6, cron.job.active)
   WHERE jobid = $1;
END;
$$;
INSERT INTO cron.job (jobname, schedule, command) VALUES
  ('talkx-scheduler-1min', '* * * * *', 'comando antigo (Bearer da anon key)');

-- Segredos de edge já existentes no Vault de produção.
INSERT INTO vault.secrets (name, secret) VALUES
  ('talkx_anon_key', 'anon-key-de-teste'),
  ('talkx_scheduler_url', 'https://example.test/functions/v1/talkx-scheduler');

INSERT INTO public.contacts (id, name, phone) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Ana', '5511990000001');

-- Campanhas: reaper, drenada e o trio do fan-out (2 na conexão A, 1 na B).
INSERT INTO public.talkx_campaigns (id, status, message_template, whatsapp_connection_id, total_recipients, created_at, updated_at) VALUES
  ('40000000-0000-0000-0000-0000000000a1', 'sending', 'Olá', '90000000-0000-0000-0000-0000000000c0', 1, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('40000000-0000-0000-0000-0000000000a2', 'sending', 'Olá', '90000000-0000-0000-0000-0000000000c0', 1, '2026-01-01 00:00:00+00', '2026-01-01 00:00:02+00'),
  ('40000000-0000-0000-0000-0000000000a3', 'sending', 'Olá', '11111111-0000-0000-0000-0000000000aa', 1, '2026-01-01 00:00:00+00', '2026-01-01 00:00:01+00'),
  ('40000000-0000-0000-0000-0000000000a4', 'sending', 'Olá', '11111111-0000-0000-0000-0000000000aa', 1, '2026-01-01 00:00:00+00', '2026-01-01 00:00:05+00'),
  ('40000000-0000-0000-0000-0000000000a5', 'sending', 'Olá', '22222222-0000-0000-0000-0000000000bb', 1, '2026-01-01 00:00:00+00', '2026-01-01 00:00:03+00');

INSERT INTO public.talkx_recipients
  (id, campaign_id, contact_id, status, provider_dispatch_started_at, delivery_claim_expires_at, created_at, updated_at) VALUES
  -- (a) preso: lease vencido DEPOIS do POST -> vira outcome_unknown.
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a1',
   '30000000-0000-0000-0000-000000000001', 'sending',
   statement_timestamp() - interval '1 hour', statement_timestamp() - interval '5 minutes',
   '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  -- (b) terminal: a campanha drenou.
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000a2',
   '30000000-0000-0000-0000-000000000001', 'sent', NULL, NULL,
   '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  -- (c) fila pendente: as 3 campanhas do fan-out seguem 'sending'.
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000a3',
   '30000000-0000-0000-0000-000000000001', 'pending', NULL, NULL,
   '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-0000000000a4',
   '30000000-0000-0000-0000-000000000001', 'pending', NULL, NULL,
   '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-0000000000a5',
   '30000000-0000-0000-0000-000000000001', 'pending', NULL, NULL,
   '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.talkx_recipients TO authenticated, service_role;
SQL

for prerequisite in "$prereq_worker_lease" "$prereq_completion" "$migration"; do
  [[ -f "$prerequisite" ]] || fail "migration ausente: $prerequisite"
  psql_test < "$prerequisite" >/dev/null
done

service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
user_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"
# O tick declara o papel de serviço sozinho: chamado como service_role (com
# EXECUTE), SEM a GUC de papel já setada. Se a declaração local quebrar, as
# checagens internas de service_role_required derrubam o tick.
role_only_session="SET ROLE service_role;"

# Sanidade do fixture: 5 campanhas sending, 1 destinatário preso.
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaigns WHERE status='sending'")" == '5' ]] \
  || fail 'fixture inválido: esperava 5 campanhas sending'

# ── ACL: as 4 funções novas só podem ser executadas por service_role ──────────
for fn in \
  'public.sweep_talkx_stuck_recipients(integer)' \
  'public.get_talkx_send_url()' \
  'public.kick_talkx_campaign(uuid)' \
  'public.trigger_talkx_engine_tick()'; do
  [[ "$(psql_q "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")" == 'f' ]] || fail "anon com EXECUTE em $fn"
  [[ "$(psql_q "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")" == 'f' ]] || fail "authenticated com EXECUTE em $fn"
  [[ "$(psql_q "SELECT has_function_privilege('service_role', '$fn', 'EXECUTE')")" == 't' ]] || fail "service_role sem EXECUTE em $fn"
done
pass 'ACL: anon/authenticated sem EXECUTE nas 4 funções; service_role com EXECUTE'

# ── (e) segredo talkx_send_url no Vault + getter só service_role ──────────────
[[ "$(psql_q "SELECT count(*) FROM vault.secrets WHERE name='talkx_send_url'")" == '1' ]] \
  || fail 'talkx_send_url deveria existir uma única vez no Vault'
[[ "$(psql_q "$service_session SELECT public.get_talkx_send_url()")" == "$send_url" ]] \
  || fail 'get_talkx_send_url não devolveu a URL esperada'
pass '(e) talkx_send_url no Vault + get_talkx_send_url() só service_role'

# ── (a) reaper: lease vencido com dispatch iniciado vira outcome_unknown ──────
[[ "$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_reap' AND status='sending' AND provider_dispatch_started_at IS NOT NULL AND delivery_claim_expires_at < statement_timestamp()")" == '1' ]] \
  || fail 'fixture inválido: esperava 1 destinatário preso com lease vencido'
swept="$(psql_q "$service_session SELECT public.sweep_talkx_stuck_recipients(500);")"
[[ "$swept" == '1' ]] || fail "sweep deveria devolver 1 [obtido: $swept]"
[[ "$(psql_q "SELECT status FROM public.talkx_recipients WHERE id='$recipient_reap'")" == 'outcome_unknown' ]] \
  || fail 'destinatário preso não virou outcome_unknown'
[[ "$(psql_q "SELECT outcome_unknown_count FROM public.talkx_campaigns WHERE id='$campaign_reap'")" == '1' ]] \
  || fail 'outcome_unknown_count da campanha não somou 1'
pass '(a) lease vencido após o POST -> outcome_unknown e contador +1'

# ── (b) conclusão: campanha sending sem fila vira completed ───────────────────
psql_test -q -c "TRUNCATE net.http_capture;" >/dev/null
psql_q "$role_only_session SELECT public.trigger_talkx_engine_tick();" >/dev/null
[[ "$(psql_q "SELECT status FROM public.talkx_campaigns WHERE id='$campaign_drain'")" == 'completed' ]] \
  || fail 'campanha sending drenada não virou completed'
pass '(b) campanha sending sem fila -> completed no tick'

# ── (c) fan-out: 1 campanha por conexão, com segredo, + scheduler ─────────────
# Só as 3 campanhas do fan-out continuam 'sending' (as duas acima já fecharam).
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaigns WHERE status='sending'")" == '3' ]] \
  || fail 'fixture inválido: esperava 3 campanhas sending antes do fan-out'
psql_test -q -c "TRUNCATE net.http_capture;" >/dev/null
psql_q "$role_only_session SELECT public.trigger_talkx_engine_tick();" >/dev/null

continue_posts="$(psql_q "SELECT count(*) FROM net.http_capture WHERE body->>'action'='continue'")"
[[ "$continue_posts" == '2' ]] || fail "esperava exatamente 2 POSTs continue (1 por conexão) [obtido: $continue_posts]"
[[ "$(psql_q "SELECT count(DISTINCT body->>'campaignId') FROM net.http_capture WHERE body->>'action'='continue'")" == '2' ]] \
  || fail 'os 2 POSTs continue deveriam ser de campanhas distintas'
[[ "$(psql_q "SELECT count(*) FROM net.http_capture WHERE body->>'campaignId' IN ('$campaign_conn_a_old','$campaign_conn_a_new')")" == '1' ]] \
  || fail 'a conexão A deveria produzir exatamente 1 POST continue'
[[ "$(psql_q "SELECT body->>'campaignId' FROM net.http_capture WHERE body->>'campaignId' IN ('$campaign_conn_a_old','$campaign_conn_a_new')")" == "$campaign_conn_a_old" ]] \
  || fail 'a campanha da conexão A deveria ser a de updated_at mais antigo'
[[ "$(psql_q "SELECT count(*) FROM net.http_capture WHERE body->>'campaignId'='$campaign_conn_b'")" == '1' ]] \
  || fail 'a conexão B deveria produzir exatamente 1 POST continue'
[[ "$(psql_q "SELECT bool_and(url = '$send_url' AND COALESCE(NULLIF(headers->>'x-cron-secret',''),'') <> '') FROM net.http_capture WHERE body->>'action'='continue'")" == 't' ]] \
  || fail 'todo POST continue deveria ir para o talkx-send com x-cron-secret'
[[ "$(psql_q "SELECT count(*) FROM net.http_capture WHERE url='$scheduler_url' AND COALESCE(NULLIF(headers->>'x-cron-secret',''),'') <> ''")" == '1' ]] \
  || fail 'o tick deveria fazer 1 POST para o talkx-scheduler com x-cron-secret'
[[ "$(psql_q "SELECT count(*) FROM net.http_capture WHERE timeout_milliseconds = 30000")" == '3' ]] \
  || fail 'todos os POSTs do tick deveriam usar timeout_milliseconds := 30000'
pass '(c) 3 sending em 2 conexões -> 2 continue (1 por conexão, a mais antiga) + 1 scheduler, todos com x-cron-secret'

# ── (d) alter_job do job existente, sem criar job novo ────────────────────────
[[ "$(psql_q "SELECT count(*) FROM cron.job WHERE jobname='talkx-scheduler-1min'")" == '1' ]] \
  || fail 'não deveria criar/duplicar o job talkx-scheduler-1min'
[[ "$(psql_q "SELECT command LIKE '%trigger_talkx_engine_tick%' FROM cron.job WHERE jobname='talkx-scheduler-1min'")" == 't' ]] \
  || fail 'o command do job deveria conter trigger_talkx_engine_tick'
[[ "$(psql_q "SELECT schedule FROM cron.job WHERE jobname='talkx-scheduler-1min'")" == '* * * * *' ]] \
  || fail 'alter_job não deveria mexer no schedule'
pass '(d) command do job existente virou SELECT public.trigger_talkx_engine_tick()'

# ── authenticated não executa nenhuma das 4 funções -> 42501 ──────────────────
expect_error 'authenticated em trigger_talkx_engine_tick -> 42501' '42501' \
  "$user_session SELECT public.trigger_talkx_engine_tick();"
expect_error 'authenticated em kick_talkx_campaign -> 42501' '42501' \
  "$user_session SELECT public.kick_talkx_campaign('$campaign_conn_b');"
expect_error 'authenticated em sweep_talkx_stuck_recipients -> 42501' '42501' \
  "$user_session SELECT public.sweep_talkx_stuck_recipients(10);"
expect_error 'authenticated em get_talkx_send_url -> 42501' '42501' \
  "$user_session SELECT public.get_talkx_send_url();"

printf 'PASS: X012 engine tick — reaper, conclusão, fan-out 1-por-conexão e cron com segredo e timeout\n'
