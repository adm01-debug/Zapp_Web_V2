#!/usr/bin/env bash
set -Eeuo pipefail

# V09b do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 — corrige a validação da janela de envio.
#
# Prova, em PostgreSQL 17 descartável, que a RPC update_talkx_campaign_limits:
#  a) recusa a combinação ASSIMÉTRICA {'send_window_start':null} com o erro de contrato
#     22023 invalid_talkx_limits_values — NÃO mais o 23514 cru da CHECK de tabela;
#  b) recusa janela invertida (start >= end) com 22023;
#  c) aceita janela válida (start < end);
#  d) aceita zerar a janela (ambos null), estado válido pela CHECK da tabela.
#
# O fixture ESPELHA a CHECK real talkx_campaigns_send_window_valid (ambos NULL OU
# ambos set E start < end) — a ausência dela no harness original da V09 era justamente
# o que escondia o vazamento do 23514.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_UPDATE_LIMITS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-sendwindow-$RANDOM-$$"
test_password="talkx_sendwindow_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-sendwindow-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos (espelham a migration) + CHECK real da janela ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;

CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE,
  role text NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles WHERE user_id = p_user AND role IN ('admin', 'supervisor')
) $$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  scheduled_at timestamptz,
  speed_profile text NOT NULL DEFAULT 'moderate',
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CHECK real da tabela (idêntica à 20260911200000): a ausência dela no harness da
-- V09 escondia o vazamento do 23514.
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_send_window_valid
  CHECK (
    (send_window_start IS NULL AND send_window_end IS NULL)
    OR (send_window_start IS NOT NULL AND send_window_end IS NOT NULL AND send_window_start < send_window_end)
  );

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profiles(id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin');

GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated;
SQL

# ---- aplica a V09 (função base + trigger function) e a V09b (fix da janela) ----
migration_v09="$repo_root/supabase/migrations/20260930180000_talkx_update_campaign_limits_rpc.sql"
migration_v09b="$repo_root/supabase/migrations/20260930320000_talkx_update_campaign_limits_send_window_fix.sql"
[[ -f "$migration_v09" ]] || fail 'migration da V09 nao existe'
[[ -f "$migration_v09b" ]] || fail 'migration da V09b nao existe'
psql_test < "$migration_v09" >/dev/null || fail 'V09 nao aplicou'
psql_test < "$migration_v09b" >/dev/null || fail 'V09b nao aplicou'
psql_test < "$migration_v09b" >/dev/null || fail 'V09b nao e replayavel (segunda aplicacao falhou)'

# ---- trigger vivo ----
psql_test -q -c 'CREATE TRIGGER enforce_talkx_campaign_mutability BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();' >/dev/null

# ---- campanha `sending` com janela válida 08:00/18:00 ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.talkx_campaigns(id, status, created_by, total_recipients, revision, send_window_start, send_window_end)
VALUES ('30000000-0000-0000-0000-000000000001', 'sending', '10000000-0000-0000-0000-000000000001', 5, 1, '08:00', '18:00');
COMMIT;
SQL

# ---- (a) assimetria {'send_window_start':null} => 22023, NÃO 23514 ----
asym_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"send_window_start":null}'::jsonb
);
COMMIT;
SQL
)"
echo "$asym_out" | grep -q 'invalid_talkx_limits_values' \
  || fail "assimetria {'send_window_start':null} nao foi recusada com 22023 (vazou 23514?): $asym_out"
echo "$asym_out" | grep -q '23514' \
  && fail "assimetria vazou a CHECK 23514 cru em vez do erro de contrato: $asym_out"

# ---- (b) janela invertida start>=end => 22023 ----
rev_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"send_window_start":"18:00","send_window_end":"08:00"}'::jsonb
);
COMMIT;
SQL
)"
echo "$rev_out" | grep -q 'invalid_talkx_limits_values' \
  || fail "janela invertida nao foi recusada (esperava invalid_talkx_limits_values): $rev_out"

# ---- (c) janela válida start<end => aceita, revision avança ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"send_window_start":"09:00","send_window_end":"17:00"}'::jsonb
);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT send_window_start || ':' || send_window_end FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '09:00:00:17:00:00' ]] \
  || fail 'janela valida nao foi gravada (esperava 09:00:00:17:00:00)'
[[ "$(psql_test -Atqc "SELECT revision FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '2' ]] \
  || fail 'revision nao avancou para 2 apos a janela valida'

# ---- (d) zerar a janela (ambos null) => aceito (estado válido pela CHECK) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 2,
  '{"send_window_start":null,"send_window_end":null}'::jsonb
);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT (send_window_start IS NULL) AND (send_window_end IS NULL) FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == 't' ]] \
  || fail 'zerar a janela (ambos null) deveria ser aceito pela CHECK'

# ---- ACL inalterada: authenticated executa, anon NAO ----
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.update_talkx_campaign_limits(uuid,bigint,jsonb)','EXECUTE')")" == 't' ]] \
  || fail 'authenticated deveria ter EXECUTE na RPC'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','public.update_talkx_campaign_limits(uuid,bigint,jsonb)','EXECUTE')")" == 'f' ]] \
  || fail 'anon NAO deveria ter EXECUTE na RPC'

printf '[OK] Talk X V09b: janela de envio validada por valores efetivos (assimetria e inversao => 22023; valida e zerar => aceitas).\n'
