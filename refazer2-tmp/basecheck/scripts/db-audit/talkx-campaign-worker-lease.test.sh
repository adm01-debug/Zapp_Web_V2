#!/usr/bin/env bash
# X010 (Fase 2 · Tela motor · banco): trava por campanha (worker lease), fila do
# worker em RPC e segredo de cron dedicado do Talk X.
#
# Contrato num PostgreSQL 17 descartável, no mesmo formato dos testes irmãos
# scripts/db-audit/talkx-campaign-transitions.test.sh e
# scripts/db-audit/talkx-delivery-leases.test.sh.
#
# Prova, contra a MIGRATION REAL do repo (20261001311230), sobre um schema mínimo
# com as colunas que as RPCs tocam:
#   (a) start 2x: a segunda chamada devolve sending:sending e NÃO toca started_at;
#   (b) worker_id/worker_lease_expires_at só mudam pela RPC de lease: um UPDATE
#       direto sem o escape hatch GUC app.talkx_worker_write é recusado com 42501;
#   (c) claim do worker A=true, do B com lease vivo=false, do B após expirar=true;
#       release do dono=true e do não-dono=false;
#   (d) talkx_next_recipients(...,20) com 45 pending devolve 20, NUNCA devolve
#       destinatário com dispatch iniciado, e respeita retry_after e lease vivo;
#   (e) segredo talkx_cron_secret no Vault + get_talkx_cron_secret() só service_role;
#   (f) authenticated chamando qualquer das 4 funções recebe 42501.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql"
postgres_image="${TALKX_CAMPAIGN_WORKER_LEASE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-campaign-worker-lease-test-$$"
test_password="talkx_campaign_worker_lease_test_only"

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

campaign_start='40000000-0000-0000-0000-0000000000a1'
campaign_queue='40000000-0000-0000-0000-0000000000a2'
campaign_small='40000000-0000-0000-0000-0000000000a3'
contact_id='30000000-0000-0000-0000-000000000001'
queue_dispatch_a='50000000-0000-0000-0000-0000000000d1'
queue_dispatch_b='50000000-0000-0000-0000-0000000000d2'
queue_live_lease='50000000-0000-0000-0000-0000000000c1'
queue_future_retry='60000000-0000-0000-0000-0000000000f1'
queue_expired_a='50000000-0000-0000-0000-0000000000e1'
queue_expired_b='50000000-0000-0000-0000-0000000000e2'
small_eligible_pending='70000000-0000-0000-0000-0000000000a1'
small_future_retry='70000000-0000-0000-0000-0000000000a2'
small_eligible_sending='70000000-0000-0000-0000-0000000000a3'
small_live_lease='70000000-0000-0000-0000-0000000000a4'
small_dispatched='70000000-0000-0000-0000-0000000000a5'

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
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, name text, nickname text, phone text, company text
);

-- V12 transcreve o ciclo de vida em talkx_campaign_events.
CREATE TABLE public.talkx_campaign_events (
  campaign_id uuid, event_type text, message text, actor_id uuid
);

-- Stub fiel do Vault (a migration cria talkx_cron_secret e a RPC de leitura).
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

INSERT INTO public.talkx_campaigns (id, status, message_template, total_recipients) VALUES
  ('40000000-0000-0000-0000-0000000000a1', 'draft',   'Olá', 1),
  ('40000000-0000-0000-0000-0000000000a2', 'sending', 'Olá', 48),
  ('40000000-0000-0000-0000-0000000000a3', 'sending', 'Olá', 5);

INSERT INTO public.contacts (id, name, nickname, phone, company) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Ana', 'Aninha', '5511990000001', 'ACME');

-- Campanha de start/claim: 1 pendente para o start passar.
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, created_at, updated_at) VALUES
  ('51000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'pending', '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00');

-- Campanha da fila: 45 pending elegíveis, ordenados por created_at,id.
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, retry_after, created_at, updated_at)
SELECT ('50000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '40000000-0000-0000-0000-0000000000a2',
       '30000000-0000-0000-0000-000000000001',
       'pending', NULL,
       timestamptz '2026-01-01 00:00:00+00' + (i || ' seconds')::interval,
       timestamptz '2026-01-01 00:00:00+00' + (i || ' seconds')::interval
FROM generate_series(1, 45) AS i;

-- Casos especiais da fila. created_at é fixo (só ordena); retry_after e o lease
-- são relativos a agora, senão "futuro" e "vencido" se invertem.
INSERT INTO public.talkx_recipients
  (id, campaign_id, contact_id, status, retry_after, provider_dispatch_started_at, delivery_claim_expires_at, created_at, updated_at) VALUES
  -- pending com retry_after no futuro: NÃO elegível, mesmo sendo o mais antigo.
  ('60000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'pending', statement_timestamp() + interval '1 hour', NULL, NULL,
   timestamptz '2025-12-31 23:59:50+00', timestamptz '2025-12-31 23:59:50+00'),
  -- sending com lease vencido e SEM dispatch: elegível (created_at depois das 45).
  ('50000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, NULL, statement_timestamp() - interval '1 hour',
   timestamptz '2026-01-01 00:01:40+00', timestamptz '2026-01-01 00:01:40+00'),
  ('50000000-0000-0000-0000-0000000000e2', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, NULL, statement_timestamp() - interval '1 hour',
   timestamptz '2026-01-01 00:01:41+00', timestamptz '2026-01-01 00:01:41+00'),
  -- sending com dispatch iniciado (created_at bem cedo): NUNCA pode aparecer.
  ('50000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour',
   timestamptz '2025-12-31 23:59:59+00', timestamptz '2025-12-31 23:59:59+00'),
  ('50000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour',
   timestamptz '2025-12-31 23:59:59+00', timestamptz '2025-12-31 23:59:59+00'),
  -- sending com lease VIVO e sem dispatch: NÃO elegível ainda.
  ('50000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, NULL, statement_timestamp() + interval '1 hour',
   timestamptz '2025-12-31 23:59:59+00', timestamptz '2025-12-31 23:59:59+00');

-- Campanha pequena: prova as exclusões uma a uma.
INSERT INTO public.talkx_recipients
  (id, campaign_id, contact_id, status, retry_after, provider_dispatch_started_at, delivery_claim_expires_at, created_at, updated_at) VALUES
  ('70000000-0000-0000-0000-0000000000a5', '40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour',
   timestamptz '2026-01-01 00:00:00+00', timestamptz '2026-01-01 00:00:00+00'),
  ('70000000-0000-0000-0000-0000000000a4', '40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, NULL, statement_timestamp() + interval '1 hour',
   timestamptz '2026-01-01 00:00:00+00', timestamptz '2026-01-01 00:00:00+00'),
  ('70000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-000000000001',
   'pending', statement_timestamp() + interval '1 hour', NULL, NULL,
   timestamptz '2026-01-01 00:00:01+00', timestamptz '2026-01-01 00:00:01+00'),
  ('70000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-000000000001',
   'sending', NULL, NULL, statement_timestamp() - interval '1 hour',
   timestamptz '2026-01-01 00:00:02+00', timestamptz '2026-01-01 00:00:02+00'),
  ('70000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-000000000001',
   'pending', NULL, NULL, NULL,
   timestamptz '2026-01-01 00:00:03+00', timestamptz '2026-01-01 00:00:03+00');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.talkx_recipients TO authenticated, service_role;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test < "$migration" >/dev/null

service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
user_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"

# (f) ACL: só service_role executa as 4 funções; anon/authenticated ficam de fora.
for fn in \
  'public.claim_talkx_campaign_worker(uuid, text, integer)' \
  'public.release_talkx_campaign_worker(uuid, text)' \
  'public.talkx_next_recipients(uuid, integer)' \
  'public.get_talkx_cron_secret()'; do
  [[ "$(psql_q "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")" == 'f' ]] || fail "anon com EXECUTE em $fn"
  [[ "$(psql_q "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")" == 'f' ]] || fail "authenticated com EXECUTE em $fn"
  [[ "$(psql_q "SELECT has_function_privilege('service_role', '$fn', 'EXECUTE')")" == 't' ]] || fail "service_role sem EXECUTE em $fn"
done
pass 'ACL: anon/authenticated sem EXECUTE nas 4 funções; service_role com EXECUTE'

# authenticated chamando qualquer das 4 funções recebe 42501.
expect_error 'authenticated em claim_talkx_campaign_worker -> 42501' '42501' \
  "$user_session SELECT public.claim_talkx_campaign_worker('$campaign_start', 'edge-a', 90);"
expect_error 'authenticated em release_talkx_campaign_worker -> 42501' '42501' \
  "$user_session SELECT public.release_talkx_campaign_worker('$campaign_start', 'edge-a');"
expect_error 'authenticated em talkx_next_recipients -> 42501' '42501' \
  "$user_session SELECT * FROM public.talkx_next_recipients('$campaign_start', 20);"
expect_error 'authenticated em get_talkx_cron_secret -> 42501' '42501' \
  "$user_session SELECT public.get_talkx_cron_secret();"

# (a) start 2x: a segunda é no-op sending:sending e não toca started_at.
started="$(psql_q "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$campaign_start', 'start');")"
[[ "$started" == 'draft:sending' ]] || fail "start deveria ser draft:sending [obtido: $started]"
started_at_before="$(psql_q "SELECT started_at FROM public.talkx_campaigns WHERE id='$campaign_start'")"
second_start="$(psql_q "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$campaign_start', 'start');")"
[[ "$second_start" == 'sending:sending' ]] || fail "segundo start deveria ser sending:sending [obtido: $second_start]"
[[ "$(psql_q "SELECT started_at FROM public.talkx_campaigns WHERE id='$campaign_start'")" == "$started_at_before" ]] || fail 'segundo start tocou started_at'
pass '(a) start 2x devolve sending:sending sem tocar started_at'

# (b) worker_id só muda pela RPC de lease: UPDATE direto sem o GUC é recusado.
expect_error '(b) UPDATE direto de worker_id sem GUC -> 42501' 'talkx_campaign_worker_managed_by_lease' \
  "$service_session UPDATE public.talkx_campaigns SET worker_id = 'rogue' WHERE id = '$campaign_start';"
[[ "$(psql_q "SELECT COALESCE(worker_id, 'null') FROM public.talkx_campaigns WHERE id='$campaign_start'")" == 'null' ]] || fail '(b) worker_id foi escrito apesar da recusa'
pass '(b) gatilho bloqueia worker_id/worker_lease_expires_at fora da RPC de lease'

# (c) claim/release.
claim_a="$(psql_q "$service_session SELECT public.claim_talkx_campaign_worker('$campaign_start', 'worker-a', 30);")"
[[ "$claim_a" == 't' ]] || fail "claim do worker A deveria ser true [obtido: $claim_a]"
claim_a_renew="$(psql_q "$service_session SELECT public.claim_talkx_campaign_worker('$campaign_start', 'worker-a', 30);")"
[[ "$claim_a_renew" == 't' ]] || fail "renovação do próprio worker A deveria ser true [obtido: $claim_a_renew]"
claim_b="$(psql_q "$service_session SELECT public.claim_talkx_campaign_worker('$campaign_start', 'worker-b', 30);")"
[[ "$claim_b" == 'f' ]] || fail "claim do worker B com lease vivo deveria ser false [obtido: $claim_b]"
[[ "$(psql_q "SELECT worker_id FROM public.talkx_campaigns WHERE id='$campaign_start'")" == 'worker-a' ]] || fail 'worker_id não ficou com o worker A'

# Expira o lease por dentro do escape hatch (a mesma porta da RPC) e tenta de novo.
psql_test -q -c "$service_session SELECT set_config('app.talkx_worker_write', 'on', false); UPDATE public.talkx_campaigns SET worker_lease_expires_at = statement_timestamp() - interval '1 second' WHERE id = '$campaign_start';" >/dev/null
claim_b_expired="$(psql_q "$service_session SELECT public.claim_talkx_campaign_worker('$campaign_start', 'worker-b', 30);")"
[[ "$claim_b_expired" == 't' ]] || fail "claim do worker B após expirar deveria ser true [obtido: $claim_b_expired]"
[[ "$(psql_q "SELECT worker_id FROM public.talkx_campaigns WHERE id='$campaign_start'")" == 'worker-b' ]] || fail 'worker_id não passou para o worker B'

release_owner="$(psql_q "$service_session SELECT public.release_talkx_campaign_worker('$campaign_start', 'worker-b');")"
[[ "$release_owner" == 't' ]] || fail "release do dono deveria ser true [obtido: $release_owner]"
release_other="$(psql_q "$service_session SELECT public.release_talkx_campaign_worker('$campaign_start', 'worker-a');")"
[[ "$release_other" == 'f' ]] || fail "release do não-dono deveria ser false [obtido: $release_other]"
[[ "$(psql_q "SELECT COALESCE(worker_id, 'null') FROM public.talkx_campaigns WHERE id='$campaign_start'")" == 'null' ]] || fail 'release não limpou worker_id'
pass '(c) claim A=true, B com lease vivo=false, B após expirar=true; release dono=true, outro=false'

# (d) fila do worker.
candidates="$(psql_q "SELECT count(*) FROM public.talkx_recipients AS r JOIN public.talkx_campaigns AS c ON c.id = r.campaign_id WHERE r.campaign_id='$campaign_queue' AND c.status='sending' AND r.provider_dispatch_started_at IS NULL AND ((r.status='pending' AND (r.retry_after IS NULL OR r.retry_after <= statement_timestamp())) OR (r.status='sending' AND r.delivery_claim_expires_at IS NOT NULL AND r.delivery_claim_expires_at <= statement_timestamp()));")"
[[ "$candidates" == '47' ]] || fail "fixture inválido: esperava 47 candidatos [obtido: $candidates]"

queue_count="$(psql_q "$service_session SELECT count(*) FROM public.talkx_next_recipients('$campaign_queue', 20);")"
[[ "$queue_count" == '20' ]] || fail "talkx_next_recipients(...,20) deveria devolver 20 [obtido: $queue_count]"

dispatch_returned="$(psql_q "$service_session SELECT count(*) FROM public.talkx_next_recipients('$campaign_queue', 20) AS n JOIN public.talkx_recipients AS r ON r.id = n.recipient_id WHERE r.provider_dispatch_started_at IS NOT NULL OR n.recipient_id IN ('$queue_dispatch_a'::uuid, '$queue_dispatch_b'::uuid);")"
[[ "$dispatch_returned" == '0' ]] || fail "talkx_next_recipients devolveu destinatário com dispatch iniciado [obtido: $dispatch_returned]"
non_pending="$(psql_q "$service_session SELECT count(*) FROM public.talkx_next_recipients('$campaign_queue', 20) AS n JOIN public.talkx_recipients AS r ON r.id = n.recipient_id WHERE r.status <> 'pending';")"
[[ "$non_pending" == '0' ]] || fail "a janela de 20 não deveria alcançar os sending elegíveis (created_at depois das 45) [obtido: $non_pending]"
first_id="$(psql_q "$service_session SELECT recipient_id FROM public.talkx_next_recipients('$campaign_queue', 20) ORDER BY recipient_id LIMIT 1;")"
[[ "$first_id" == '50000000-0000-0000-0000-000000000001' ]] || fail "ordenação por created_at,id quebrou (primeiro: $first_id)"
pass '(d) fila devolve 20 de 45 e nunca destinatário com dispatch iniciado'

small_count="$(psql_q "$service_session SELECT count(*) FROM public.talkx_next_recipients('$campaign_small', 10);")"
[[ "$small_count" == '2' ]] || fail "campanha pequena deveria devolver 2 elegíveis [obtido: $small_count]"
small_ids="$(psql_q "$service_session SELECT string_agg(n.recipient_id::text, ',' ORDER BY r.created_at, r.id) FROM public.talkx_next_recipients('$campaign_small', 10) AS n JOIN public.talkx_recipients AS r ON r.id = n.recipient_id;")"
[[ "$small_ids" == "$small_eligible_sending,$small_eligible_pending" ]] || fail "campanha pequena devolveu o conjunto errado [obtido: $small_ids]"
pass '(d) retry_after no futuro, lease vivo e dispatch iniciado ficam fora da fila'

# (e) segredo de cron dedicado.
secret_count="$(psql_q "SELECT count(*) FROM vault.secrets WHERE name='talkx_cron_secret'")"
[[ "$secret_count" == '1' ]] || fail "talkx_cron_secret deveria existir uma única vez [obtido: $secret_count]"
secret_ok="$(psql_q "$service_session SELECT public.get_talkx_cron_secret() IS NOT NULL")"
[[ "$secret_ok" == 't' ]] || fail 'service_role não leu o segredo de cron'
pass '(e) talkx_cron_secret no Vault + get_talkx_cron_secret() só service_role'

printf 'PASS: X010 worker lease — start idempotente, trava por campanha, fila do worker e segredo de cron\n'
