#!/usr/bin/env bash
set -Eeuo pipefail

# V06 (correção de replay) do PLANO_TALKX_V3_100_ETAPAS_2026-09-29.
#
# Prova, em PostgreSQL 17 descartável, que a migration 20260916230000
# (talkx_e93_settings) agora é REPLAY-SAFE:
#   a) o arquivo corrigido aplica limpo (CRIA tabela + policy + 6 settings);
#   b) re-aplica limpo (idempotente) — é o que o `supabase db reset` faz;
#   c) o conteúdo ANTIGO (CREATE POLICY IF NOT EXISTS, sintaxe inexistente)
#      quebrava o replay com "syntax error at or near 'not'" — provado por mutação.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_SETTINGS_REPLAY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-settings-replay-$RANDOM-$$"
test_password="talkx_settings_replay_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-settings-replay-[0-9]+-[0-9]+$ ]]; then
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

# roles referenciados pela migration (GRANT/REVOKE/TO)
psql_test -q -c 'CREATE ROLE authenticated NOLOGIN;' >/dev/null
psql_test -q -c 'CREATE ROLE service_role NOLOGIN;' >/dev/null

migration="$repo_root/supabase/migrations/20260916230000_talkx_e93_settings.sql"
[[ -f "$migration" ]] || fail 'migration 20260916230000 nao existe'

# ---- (a) aplicação limpa ----
psql_test < "$migration" >/dev/null || fail 'migration corrigida nao aplicou limpa'

# ---- (b) re-aplicação (replay idempotente) ----
psql_test < "$migration" >/dev/null || fail 'migration corrigida NAO e replay-safe (2a aplicacao falhou)'

# ---- verificação de resultado ----
n="$(psql_test -Atqc 'SELECT count(*) FROM public.talkx_settings')"
[[ "$n" == '6' ]] || fail "esperava 6 settings, veio $n"
pol="$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_settings' AND policyname='authenticated_read_talkx_settings'")"
[[ "$pol" == '1' ]] || fail "policy authenticated_read_talkx_settings ausente (count=$pol)"

# ---- (c) mutação red-first: o conteúdo ANTIGO quebra o replay ----
old_content="$(printf '%s\n' \
  'CREATE TABLE IF NOT EXISTS public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL);' \
  'CREATE POLICY IF NOT EXISTS "authenticated_read_talkx_settings" ON public.talkx_settings FOR SELECT TO authenticated USING (true);')"
old_out="$(docker exec -i "$container_name" psql -X -U postgres -d postgres 2>&1 <<< "$old_content" || true)"
echo "$old_out" | grep -qi "syntax error" \
  || fail "o conteudo ANTIGO (CREATE POLICY IF NOT EXISTS) deveria falhar com syntax error: $old_out"

printf '[OK] Talk X V06: migration 20260916230000 replay-safe (aplica + reaplica; policy e 6 settings presentes).\n'
