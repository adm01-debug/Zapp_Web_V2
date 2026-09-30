#!/usr/bin/env bash
# V06 do docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md.
#
# Prova, em PostgreSQL 17 descartavel, que talkx_settings passou a ter policy de
# UPDATE e que ela respeita o papel: admin/supervisor persiste, agente NAO.
#
# O primeiro bloco e o red-first: antes da V06 a tabela tinha SO SELECT, entao o
# UPDATE era silenciosamente ignorado (0 linhas) — exatamente o bug do save do
# useTalkXSettings.ts:37-38. Se o harness nao reproduzir o bug ANTES da migration,
# ele nao estaria provando nada.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="$repo_root/supabase/migrations/20260930100000_talkx_settings_policies_replay_safe.sql"
postgres_image="${TALKX_SETTINGS_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-settings-rls-$RANDOM-$$"
test_password="talkx_settings_rls_test_only"
admin_uid='30000000-0000-0000-0000-000000000001'
agent_uid='30000000-0000-0000-0000-000000000002'

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-settings-rls-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ -f "$migration_file" ]] || fail 'migration da V06 nao existe'

for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
    printf 'WARN: container falhou (%s/3)\n' "$attempt" >&2; continue
  fi
  ready=false
  for _ in $(seq 1 30); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] && break
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role IN ('admin','supervisor'))
$$;

-- estado efetivo pre-V06: tabela criada, RLS ligada, GRANT, e SO a policy de SELECT
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_settings FROM PUBLIC;
GRANT SELECT, UPDATE ON public.talkx_settings TO authenticated;
CREATE POLICY "authenticated_read_talkx_settings"
  ON public.talkx_settings FOR SELECT TO authenticated USING (true);

INSERT INTO public.profiles(id, role) VALUES
  ('30000000-0000-0000-0000-000000000001', 'admin'),
  ('30000000-0000-0000-0000-000000000002', 'agent');
INSERT INTO public.talkx_settings(key, value) VALUES ('send_window', '{"start":"08:00"}'::jsonb);
SQL

valor() {
  psql_test -Atqc "SELECT value->>'start' FROM public.talkx_settings WHERE key = 'send_window'"
}

update_como() { # $1 = uid, $2 = novo valor
  psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$1';
UPDATE public.talkx_settings SET value = '{"start":"$2"}'::jsonb, updated_at = now() WHERE key = 'send_window';
COMMIT;
SQL
}

# --- red-first: sem a policy de UPDATE, nada persiste (o bug V06) ---
update_como "$admin_uid" '09:00'
[[ "$(valor)" == '08:00' ]] \
  || fail 'harness invalido: o update nao deveria persistir antes da V06'
printf '[OK] red-first: antes da V06 o update e descartado silenciosamente (bug reproduzido).\n'

# --- aplica a V06 (e prova idempotencia: duas vezes) ---
psql_test < "$migration_file" >/dev/null || fail 'V06 nao aplicou'
psql_test < "$migration_file" >/dev/null || fail 'V06 nao e idempotente (segunda aplicacao falhou)'

# --- admin/supervisor persiste ---
update_como "$admin_uid" '09:00'
[[ "$(valor)" == '09:00' ]] || fail 'admin nao persistiu apos a V06 (o save continua quebrado)'

# --- agente NAO persiste ---
update_como "$agent_uid" '07:00'
[[ "$(valor)" == '09:00' ]] || fail 'agente conseguiu escrever em talkx_settings'

# --- leitura segue disponivel para authenticated ---
leitura="$(psql_test -q <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$agent_uid';
SELECT value->>'start' FROM public.talkx_settings WHERE key = 'send_window';
COMMIT;
SQL
)"
printf '%s' "$leitura" | grep -q '09:00' || fail 'agente perdeu a leitura de talkx_settings'

printf '[OK] V06: talkx_settings tem leitura para authenticated e UPDATE so para admin/supervisor.\n'
