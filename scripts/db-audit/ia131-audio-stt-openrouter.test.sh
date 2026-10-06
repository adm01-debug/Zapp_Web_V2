#!/usr/bin/env bash
# IA-131 / IA-AUDIO-001 — prova que a migration de audio_stt do OpenRouter
# acrescenta somente a modalidade nova, preserva modalidades/capacidades existentes,
# cria capabilities quando ausente e tem rollback que remove apenas audio_stt.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006100606_ia131_audio_stt_openrouter.sql"
postgres_image="${IA131_AUDIO_STT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ia131-audio-stt-test-$$"
tmp_dir="$repo_root/.tmp/ia131-audio-stt-test-$$"

cleanup() {
  rm -rf "$tmp_dir" >/dev/null 2>&1 || true
  if [[ "$container_name" =~ ^zapp-v2-ia131-audio-stt-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

apply_migration() {
  psql_file "$migration" >/dev/null
}

rollback_sql() {
  python3 - "$migration" <<'PY'
from pathlib import Path
import sys
for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    if line.startswith('-- Rollback:'):
        sql = line.removeprefix('-- Rollback:').strip()
        if not sql:
            raise SystemExit('Rollback vazio')
        print(sql)
        raise SystemExit(0)
raise SystemExit('Linha -- Rollback: nao encontrada')
PY
}

apply_rollback() {
  rollback_sql > "$tmp_dir/rollback.sql"
  psql_file "$tmp_dir/rollback.sql" >/dev/null
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
mkdir -p "$tmp_dir"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1))
    (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

psql_sql "
CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT '2026-01-01 00:00:00+00'
);
INSERT INTO public.ai_providers (id, name, config) VALUES
  (
    'f99209ea-294d-4124-b480-b3ecf60c9049',
    'OpenRouter',
    jsonb_build_object(
      'headers', jsonb_build_object('x', 'y'),
      'capabilities', jsonb_build_object('modalities', jsonb_build_array('vision', 'text'), 'other', 'keep'),
      'routing', 'keep'
    )
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Outro',
    jsonb_build_object('capabilities', jsonb_build_object('modalities', jsonb_build_array('vision')))
  );
" >/dev/null

apply_migration
expect_value 'modalidade existente vision preservada' 't' "SELECT config->'capabilities'->'modalities' ? 'vision' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'modalidade existente text preservada' 't' "SELECT config->'capabilities'->'modalities' ? 'text' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'audio_stt acrescentado' 't' "SELECT config->'capabilities'->'modalities' ? 'audio_stt' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'chave irmã dentro de capabilities preservada' 'keep' "SELECT config #>> '{capabilities,other}' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'chave top-level preservada' 'keep' "SELECT config ->> 'routing' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'outro provedor intocado' '["vision"]' "SELECT config #> '{capabilities,modalities}' FROM public.ai_providers WHERE id = '11111111-1111-1111-1111-111111111111';"

apply_migration
expect_value 'migration idempotente: audio_stt aparece uma vez' '1' "SELECT count(*) FROM public.ai_providers p, jsonb_array_elements_text(p.config #> '{capabilities,modalities}') AS m(value) WHERE p.id = 'f99209ea-294d-4124-b480-b3ecf60c9049' AND m.value = 'audio_stt';"

apply_rollback
expect_value 'rollback remove audio_stt' 'f' "SELECT config->'capabilities'->'modalities' ? 'audio_stt' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'rollback preserva modalidade text' 't' "SELECT config->'capabilities'->'modalities' ? 'text' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'rollback preserva chave irmã' 'keep' "SELECT config #>> '{capabilities,other}' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"

psql_sql "UPDATE public.ai_providers SET config = jsonb_build_object('headers', jsonb_build_object('x', 'y'), 'routing', 'keep') WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';" >/dev/null
apply_migration
expect_value 'migration cria capabilities quando ausente' 't' "SELECT config->'capabilities'->'modalities' ? 'audio_stt' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'migration com capabilities ausente preserva chave top-level' 'keep' "SELECT config ->> 'routing' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"

printf '[PASS] ia131-audio-stt-openrouter: migration e rollback preservam capacidades existentes\n'
