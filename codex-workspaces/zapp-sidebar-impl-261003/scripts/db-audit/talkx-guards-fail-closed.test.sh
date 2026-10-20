#!/usr/bin/env bash
set -Eeuo pipefail

# MAPA (achado de auditoria, red-team): fecha o FAIL-OPEN dos dois guards de
# mutabilidade do Talk X — enforce_talkx_campaign_mutability e
# enforce_talkx_recipient_snapshot_mutability — via migration 20260930420000.
#
# Prova, em PostgreSQL 17 descartável, que uma sessão com papel `authenticated` mas SEM
# a claim do JWT (auth.role() IS NULL) NÃO escreve silenciosamente: o guard levanta
# `talkx_guard_auth_role_undefined` (fail-closed), em vez de passar a linha (fail-open).
#
#   a) campanha, authenticated sem claim        -> talkx_guard_auth_role_undefined;
#   b) destinatário, authenticated sem claim    -> talkx_guard_auth_role_undefined;
#   c) campanha, postgres (sistema)             -> permitido (bypass legítimo);
#   d) campanha, service_role                   -> permitido (bypass legítimo);
#   e) campanha, authenticated com claim, INSERT não-draft -> talkx_campaign_insert_must_be_draft (regressão);
#   f) destinatário, authenticated com claim, escrita direta -> talkx_recipient_snapshot_required (regressão).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_GUARDS_FAIL_CLOSED_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-guards-fail-closed-$RANDOM-$$"
test_password="***"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-guards-fail-closed-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="***" "$postgres_image" >/dev/null

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

# ---- fixtures minimos: auth.role() retorna NULL sem claim (igual a produção) ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
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
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE
);
INSERT INTO public.profiles(id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin');
GRANT SELECT, INSERT, UPDATE ON public.talkx_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.talkx_recipients TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.talkx_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.talkx_recipients TO service_role;
SQL

# ---- aplica a migration fail-closed (substitui os 2 guards); replayável ----
mapa="$repo_root/supabase/migrations/20260930420000_talkx_guards_fail_closed.sql"
[[ -f "$mapa" ]] || fail 'migration fail-closed nao existe'
psql_test < "$mapa" >/dev/null || fail 'migration fail-closed nao aplicou'
psql_test < "$mapa" >/dev/null || fail 'migration fail-closed nao e replayavel (segunda aplicacao falhou)'

# ---- triggers vivos (apontam para as funções já substituídas) ----
psql_test -q -c 'CREATE TRIGGER enforce_talkx_campaign_mutability BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();' >/dev/null
psql_test -q -c 'CREATE TRIGGER enforce_talkx_recipient_snapshot_mutability BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_recipients FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_recipient_snapshot_mutability();' >/dev/null

# ---- campanha draft + destinatário de fixture (como postgres, antes dos checks) ----
psql_test -q <<'SQL' >/dev/null
INSERT INTO public.talkx_campaigns(id, status, created_by)
VALUES ('30000000-0000-0000-0000-000000000001', 'draft', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_recipients(id, campaign_id)
VALUES ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
SQL

camp_id='30000000-0000-0000-0000-000000000001'
rec_id='40000000-0000-0000-0000-000000000001'

# ---- a) campanha: authenticated SEM claim => negado (fail-closed) ----
a="$(psql_test 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
UPDATE public.talkx_campaigns SET speed_profile = 'fast' WHERE id = '$camp_id';
COMMIT;
SQL
)"
echo "$a" | grep -q 'talkx_guard_auth_role_undefined' \
  || fail "a) campanha sem claim NAO foi negada (esperava talkx_guard_auth_role_undefined): $a"

# ---- b) destinatário: authenticated SEM claim => negado (fail-closed) ----
b="$(psql_test 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
UPDATE public.talkx_recipients SET campaign_id = campaign_id WHERE id = '$rec_id';
COMMIT;
SQL
)"
echo "$b" | grep -q 'talkx_guard_auth_role_undefined' \
  || fail "b) destinatario sem claim NAO foi negado (esperava talkx_guard_auth_role_undefined): $b"

# ---- c) postgres (sistema) => permitido (bypass legítimo) ----
psql_test -q -c "UPDATE public.talkx_campaigns SET speed_profile = 'slow' WHERE id = '$camp_id';" >/dev/null \
  || fail 'c) postgres nao conseguiu escrever (bypass legítimo do sistema)'
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'slow' ]] \
  || fail 'c) postgres nao gravou speed_profile'

# ---- d) service_role => permitido (bypass legítimo) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.talkx_campaigns SET speed_profile = 'moderate' WHERE id = '$camp_id';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'moderate' ]] \
  || fail 'd) service_role nao gravou speed_profile'

# ---- e) authenticated COM claim: INSERT não-draft => negado (regressão de mutabilidade) ----
e="$(psql_test 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.talkx_campaigns(id, status, created_by)
VALUES ('30000000-0000-0000-0000-000000000002', 'sending', '10000000-0000-0000-0000-000000000001');
COMMIT;
SQL
)"
echo "$e" | grep -q 'talkx_campaign_insert_must_be_draft' \
  || fail "e) INSERT não-draft com claim NAO foi negado (regressão): $e"

# ---- f) destinatário COM claim: escrita direta sem GUC => negado (regressão) ----
f="$(psql_test 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.talkx_recipients(id, campaign_id)
VALUES ('40000000-0000-0000-0000-000000000002', '$camp_id');
COMMIT;
SQL
)"
echo "$f" | grep -q 'talkx_recipient_snapshot_required' \
  || fail "f) escrita direta de destinatario com claim NAO foi negada (regressão): $f"

printf '[OK] Talk X MAPA: guards fail-closed — authenticated sem claim nega; sistema/service_role seguem livres.\n'
