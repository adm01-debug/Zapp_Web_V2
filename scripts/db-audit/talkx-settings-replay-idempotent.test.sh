#!/usr/bin/env bash
set -Eeuo pipefail

# R2-01 (achado da auditoria Onda 2, domínio replay/DBA): fecha a cadeia de replay do
# talkx_settings. A migration original 20260916230000 usa `CREATE POLICY IF NOT EXISTS`
# (sintaxe inexistente, 42601); num replay atômico o CREATE TABLE vai a rollback e a
# tabela nunca nasce, estourando 42P01 na fix 20260930112833. A migration idempotente
# 20260930410000 (re)cria tabela + RLS + grants + seed + policies e fecha o buraco.
#
# Prova, em PostgreSQL 17 descartável:
#   RED   — a original (atômica) falha em 42601 e deixa a tabela ausente;
#           a fix V06 falha em 42P01 (drop policy em tabela inexistente);
#   GREEN — a migration idempotente cria a tabela, RLS, seed (6) e policies;
#           reaplicar é no-op (idempotente, 6 linhas);
#   POL   — authenticated lê; anon não lê (RLS); admin atualiza; agente não atualiza.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_SETTINGS_REPLAY_IDEMPOTENT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-settings-replay-$RANDOM-$$"
test_password="***"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-settings-replay-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_atomic_file() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U postgres -d postgres < "$1"; }

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

# ---- fixtures minimos ----
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
INSERT INTO public.profiles(id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin');
SQL

original="$repo_root/supabase/migrations/20260916230000_talkx_e93_settings.sql"
fix_v06="$repo_root/supabase/migrations/20260930112833_talkx_settings_policies_replay_safe.sql"
idem="$repo_root/supabase/migrations/20260930410000_talkx_settings_replay_idempotent.sql"
[[ -f "$original" ]] || fail 'migration original (e93) nao existe'
[[ -f "$fix_v06" ]] || fail 'migration fix V06 nao existe'
[[ -f "$idem" ]] || fail 'migration idempotente nao existe'

# ---- RED: original aplicada atomicamente -> 42601 e tabela ausente ----
red1="$(psql_atomic_file "$original" 2>&1 || true)"
echo "$red1" | grep -q 'syntax error' \
  || fail "RED: original nao falhou em CREATE POLICY IF NOT EXISTS (esperava 42601): $red1"
[[ "$(psql_test -Atqc "SELECT to_regclass('public.talkx_settings')")" == '' ]] \
  || fail 'RED: talkx_settings deveria estar ausente apos rollback atomico'

# ---- RED: fix V06 -> 42P01 (drop policy em tabela inexistente) ----
red2="$(psql_atomic_file "$fix_v06" 2>&1 || true)"
echo "$red2" | grep -qE 'does not exist' \
  || fail "RED: fix V06 nao falhou em drop policy (esperava 42P01): $red2"

# ---- GREEN: migration idempotente cria tudo; reaplicar é no-op ----
psql_test < "$idem" >/dev/null || fail 'migration idempotente nao aplicou (GREEN)'
psql_test < "$idem" >/dev/null || fail 'migration idempotente nao e replayavel (segunda aplicacao falhou)'

[[ "$(psql_test -Atqc "SELECT to_regclass('public.talkx_settings')")" == 'talkx_settings' ]] \
  || fail 'GREEN: talkx_settings nao existe apos a migration idempotente'
[[ "$(psql_test -Atqc "SELECT relrowsecurity FROM pg_class WHERE relname='talkx_settings'")" == 't' ]] \
  || fail 'GREEN: RLS nao esta habilitado'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.talkx_settings")" == '6' ]] \
  || fail 'GREEN: seed nao tem 6 linhas'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policy WHERE polrelid='public.talkx_settings'::regclass")" == '2' ]] \
  || fail 'GREEN: nao ha 2 policies'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.talkx_settings")" == '6' ]] \
  || fail 'REENVIO: seed duplicou na reaplicacao (nao-idempotente)'

# ---- POL: authenticated lê; anon não lê; admin atualiza; agente não atualiza ----
pol_read="$(psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000001'; SELECT count(*) FROM public.talkx_settings; ROLLBACK;")"
[[ "$pol_read" == '6' ]] || fail "POL: authenticated nao leu as 6 linhas (got $pol_read)"

pol_anon="$(psql_test -Atqc "BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.talkx_settings; ROLLBACK;")"
[[ "$pol_anon" == '0' ]] || fail "POL: anon conseguiu ler talkx_settings (got $pol_anon)"

pol_admin="$(psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000002'; UPDATE public.talkx_settings SET updated_at=updated_at WHERE key='reply_window_hours'; COMMIT; SELECT 1;")"
[[ "$pol_admin" == '1' ]] || fail "POL: admin nao atualizou (got $pol_admin)"

pol_agent_upd="$(psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000001'; WITH u AS (UPDATE public.talkx_settings SET updated_at=updated_at WHERE key='reply_window_hours' RETURNING 1) SELECT count(*) FROM u; ROLLBACK;")"
[[ "$pol_agent_upd" == '0' ]] || fail "POL: agente (não-admin) conseguiu atualizar (got $pol_agent_upd)"

printf '[OK] Talk X R2-01: replay do talkx_settings fechado — idempotente, seed/policies íntegros, RLS ok.\n'
