#!/usr/bin/env bash
# N-010: prova que a migration 20261010130000_storage_limits_whatsapp_audio_multiplix.sql
# fixa file_size_limit em whatsapp-media, audio-messages e multiplix-voice.
#
# RED   — sem a migration, os buckets nao tem teto (file_size_limit NULL): um
#         upload de 30MB passa na checagem (custo sem controle = defeito);
# GREEN — com a migration, o mesmo upload de 30MB e recusado e 1MB passa.
#
# NOTA DE ESCOPO (ponto 1 da recusa): o enforcement real do teto vive na API do
# Supabase Storage (fora do Postgres): a API le storage.buckets.file_size_limit
# e recusa o upload acima do teto. No Postgres nao ha trigger nem CHECK que
# barre o objeto — o que a migration entrega e o teto que a API le. A funcao
# test_upload_gate abaixo (só do teste, nunca da migration) espelha exatamente
# essa checagem da API (bucket + tamanho -> recusa quando tamanho > limite)
# para provar o comportamento no banco local.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010130000_storage_limits_whatsapp_audio_multiplix.sql"
postgres_image="${STORAGE_LIMITS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-storage-limits-wam-$$"
test_password="storage_limits_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" | tail -n1; }
# Leitura como papel real: a migration roda como dono (owner, como no deploy),
# mas toda verificacao de estado e feita como authenticated (com claims).
as_user() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}', false); $sql" | tail -n1
}
expect_value() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_gate_ok() {
  local label="$1" bucket="$2" size="$3"
  as_user "SELECT test_upload_gate('$bucket', $size);" >/dev/null \
    || fail "$label: upload de $size bytes em $bucket deveria passar, mas foi recusado"
  printf '[PASS] %s\n' "$label"
}
expect_gate_refused() {
  local label="$1" bucket="$2" size="$3" out st
  set +e; out="$(as_user "SELECT test_upload_gate('$bucket', $size);" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$label: upload de $size bytes em $bucket deveria ser recusado, mas passou"; }
  [[ "$out" == *'object too large'* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava 'object too large' no erro"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
# Sem a migration (worktree da base) o teste falha aqui: e o vermelho.
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

start_postgres() {
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
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ── infraestrutura que o Supabase fornece (storage schema + papeis) ──────────
# storage.buckets e gerenciado pelo Supabase: nenhuma migration do repositorio
# cria a TABELA nem as linhas destes tres buckets (git grep: INSERTs reais só
# para avatars/custom-emojis/team-chat-files). A tabela abaixo usa o formato
# real das migrations do repo (id text, name, public, file_size_limit,
# allowed_mime_types) e as linhas espelham o baseline N-137 (privados, sem
# limite): e o mais proximo possivel dos buckets reais no banco local.
psql_test >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
SQL

# ── gate de upload: espelho da checagem da API do Storage (só do teste) ──────
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.test_upload_gate(p_bucket text, p_size bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_limit bigint;
BEGIN
  SELECT file_size_limit INTO v_limit FROM storage.buckets WHERE name = p_bucket;
  IF v_limit IS NULL THEN RETURN; END IF;
  IF p_size > v_limit THEN
    RAISE EXCEPTION 'object too large: % bytes exceeds bucket % limit of % bytes', p_size, p_bucket, v_limit;
  END IF;
END;
$$;
SQL

# ── cria os buckets sem teto (estado ANTERIOR / defeito) ─────────────────────
psql_test >/dev/null <<'SQL'
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('whatsapp-media', 'whatsapp-media', false, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('audio-messages', 'audio-messages', false, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('multiplix-voice', 'multiplix-voice', false, NULL) ON CONFLICT (id) DO NOTHING;
SQL

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.1 whatsapp-media sem file_size_limit antes da migration' '' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';")"
expect_value 'A.2 audio-messages sem file_size_limit antes da migration' '' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';")"
expect_value 'A.3 multiplix-voice sem file_size_limit antes da migration' '' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';")"
expect_value 'A.4 whatsapp-media privado (baseline)' 'f' "$(as_user "SELECT public FROM storage.buckets WHERE name='whatsapp-media';")"
expect_value 'A.5 audio-messages privado (baseline)' 'f' "$(as_user "SELECT public FROM storage.buckets WHERE name='audio-messages';")"
expect_value 'A.6 multiplix-voice privado (baseline)' 'f' "$(as_user "SELECT public FROM storage.buckets WHERE name='multiplix-voice';")"
# Sem teto, upload acima de qualquer limite futuro passa: e o defeito (custo sem controle).
expect_gate_ok 'A.7 upload de 30MB em whatsapp-media passa sem teto (defeito)' 'whatsapp-media' 31457280
expect_gate_ok 'A.8 upload de 30MB em audio-messages passa sem teto (defeito)' 'audio-messages' 31457280
expect_gate_ok 'A.9 upload de 60MB em multiplix-voice passa sem teto (defeito)' 'multiplix-voice' 62914560

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_test < "$migration" >/dev/null || fail 'B.0 migration falhou ao aplicar'

expect_value 'B.1 whatsapp-media=26214400 (25MB)' '26214400' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';")"
expect_value 'B.2 audio-messages=26214400 (25MB)' '26214400' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';")"
expect_value 'B.3 multiplix-voice=52428800 (50MB)' '52428800' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';")"
# Upload acima do teto agora e recusado; uso legitimo abaixo do teto passa.
expect_gate_refused 'B.4 upload de 30MB em whatsapp-media recusado' 'whatsapp-media' 31457280
expect_gate_refused 'B.5 upload de 30MB em audio-messages recusado' 'audio-messages' 31457280
expect_gate_refused 'B.6 upload de 60MB em multiplix-voice recusado' 'multiplix-voice' 62914560
expect_gate_ok 'B.7 upload de 1MB em whatsapp-media passa (uso legitimo)' 'whatsapp-media' 1048576

# Rollback: extrai o SQL do próprio cabeçalho da migration (linhas '--   UPDATE'),
# nao reescreve a mao — prova que o Rollback documentado executa de fato.
printf '\n============ BLOCO C — rollback do cabecalho ============\n'
rollback_sql="$(grep -E '^--   ' "$migration" | sed -E 's/^--   //')"
[[ -n "$rollback_sql" ]] || fail 'C.0 cabecalho da migration nao tem linhas de rollback (--   ...)'
[[ "$(printf '%s\n' "$rollback_sql" | grep -c '^UPDATE')" == '3' ]] || fail 'C.0 rollback deveria ter 3 UPDATEs'
printf '%s\n' "$rollback_sql" | psql_test -v ON_ERROR_STOP=1 >/dev/null || fail 'C.0 rollback do cabecalho falhou ao executar'

expect_value 'C.1 rollback restaura NULL em whatsapp-media' 't' "$(as_user "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='whatsapp-media';")"
expect_value 'C.2 rollback restaura NULL em audio-messages' 't' "$(as_user "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='audio-messages';")"
expect_value 'C.3 rollback restaura NULL em multiplix-voice' 't' "$(as_user "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='multiplix-voice';")"
expect_gate_ok 'C.4 sem teto de novo, 30MB passa (estado anterior restaurado)' 'whatsapp-media' 31457280

# Reaplica a migration (idempotencia)
printf '\n============ BLOCO D — idempotencia ============\n'
psql_test < "$migration" >/dev/null || fail 'D.0 reaplicacao da migration falhou'

expect_value 'D.1 reaplicacao: whatsapp-media=26214400' '26214400' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';")"
expect_value 'D.2 reaplicacao: audio-messages=26214400' '26214400' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';")"
expect_value 'D.3 reaplicacao: multiplix-voice=52428800' '52428800' "$(as_user "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';")"

printf '\nPASS: N-010 — file_size_limit em whatsapp-media (25MB), audio-messages (25MB) e multiplix-voice (50MB); upload acima do teto recusado.\n'
