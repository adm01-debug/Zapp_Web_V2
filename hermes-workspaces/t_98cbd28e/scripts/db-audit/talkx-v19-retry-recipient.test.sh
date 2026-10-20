#!/usr/bin/env bash
# Harness descartável: V19 — retry manual de destinatário terminal.
# Prova: retry_talkx_recipient reabre failed/outcome_unknown para pending,
#        incrementa attempt_count e recusa quando attempt_count >= 3.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v19_test_only'
cid="talkx-v19-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v19-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
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

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  error_message text,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  delivery_last_claim_token uuid,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO public.talkx_recipients (id, status, attempt_count)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'failed', 0),
  ('10000000-0000-0000-0000-000000000002', 'outcome_unknown', 1),
  ('10000000-0000-0000-0000-000000000003', 'failed', 3),
  ('10000000-0000-0000-0000-000000000004', 'sent', 0);
SQL

# RED: RPC ainda não existe
red_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-000000000001'); COMMIT;" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* || "$red_err" == *'function'* ]] \
  || fail "RED: retry_talkx_recipient deveria nao existir antes da migration (got $red_err)"

# GREEN: aplica migration
psql_test < "$repo_root/supabase/migrations/20260930630000_talkx_v19_retry_recipient.sql" >/dev/null \
  || fail 'migration V19 nao aplicou (GREEN)'

retry_failed="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-000000000001'); COMMIT;")"
[[ "$retry_failed" == 't' ]] || fail "GREEN: failed (attempt 0) deveria retry=true (got $retry_failed)"

retry_unknown="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-000000000002'); COMMIT;")"
[[ "$retry_unknown" == 't' ]] || fail "GREEN: outcome_unknown (attempt 1) deveria retry=true (got $retry_unknown)"

retry_ceiling="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-000000000003'); COMMIT;")"
[[ "$retry_ceiling" == 'f' ]] || fail "GREEN: failed (attempt 3) deveria retry=false (got $retry_ceiling)"

retry_sent="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.retry_talkx_recipient('10000000-0000-0000-0000-000000000004'); COMMIT;")"
[[ "$retry_sent" == 'f' ]] || fail "GREEN: sent (nao terminal) deveria retry=false (got $retry_sent)"

status_after="$(psql_test -Atqc "SELECT status || ':' || attempt_count FROM public.talkx_recipients WHERE id='10000000-0000-0000-0000-000000000001'")"
[[ "$status_after" == 'pending:1' ]] || fail "GREEN: failed deveria virar pending:1 (got $status_after)"

echo '[OK] Talk X V19: retry manual reabre failed/outcome_unknown e respeita teto de 3 tentativas.'
