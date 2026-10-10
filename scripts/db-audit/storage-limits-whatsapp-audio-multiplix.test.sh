#!/usr/bin/env bash
# N-009 (continuacao): prova que a migration 20261010130000_storage_limits_whatsapp_audio_multiplix.sql
# define file_size_limit nos buckets whatsapp-media, audio-messages e multiplix-voice.
#
# RED   — antes da migration, os buckets nao tem limite de tamanho (custo sem controle);
# GREEN — depois da migration, file_size_limit esta definido nos tres buckets.

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

# ── infraestrutura que o Supabase fornece (storage schema) ────────────────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  public boolean NOT NULL DEFAULT true,
  file_size_limit bigint,
  allowed_mime_types text[]
);
SQL

# ── cria os buckets sem limite (estado ANTERIOR / defeito) ─────────────────
psql_test >/dev/null <<'SQL'
INSERT INTO storage.buckets (name, public, file_size_limit) VALUES ('whatsapp-media', false, NULL) ON CONFLICT (name) DO NOTHING;
INSERT INTO storage.buckets (name, public, file_size_limit) VALUES ('audio-messages', false, NULL) ON CONFLICT (name) DO NOTHING;
INSERT INTO storage.buckets (name, public, file_size_limit) VALUES ('multiplix-voice', false, NULL) ON CONFLICT (name) DO NOTHING;
SQL

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

WAM_SIZE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';")"
AM_SIZE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';")"
MV_SIZE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';")"

[[ "$WAM_SIZE" == '' ]] || fail "A.1 whatsapp-media deveria ter file_size_limit NULL antes da migration"
[[ "$AM_SIZE" == '' ]] || fail "A.2 audio-messages deveria ter file_size_limit NULL antes da migration"
[[ "$MV_SIZE" == '' ]] || fail "A.3 multiplix-voice deveria ter file_size_limit NULL antes da migration"
printf '[PASS] A.1-A.3 buckets sem limite de tamanho antes da migration (defeito)\n'

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_test < "$migration" >/dev/null || fail 'B.0 migration falhou ao aplicar'

WAM_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';")"
AM_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';")"
MV_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';")"

[[ "$WAM_SIZE_AFTER" == '26214400' ]] || fail "B.1 whatsapp-media deveria ter file_size_limit=26214400 apos a migration"
[[ "$AM_SIZE_AFTER" == '26214400' ]] || fail "B.2 audio-messages deveria ter file_size_limit=26214400 apos a migration"
[[ "$MV_SIZE_AFTER" == '52428800' ]] || fail "B.3 multiplix-voice deveria ter file_size_limit=52428800 apos a migration"
printf '[PASS] B.1 whatsapp-media=26214400, B.2 audio-messages=26214400, B.3 multiplix-voice=52428800\n'

# Rollback: restaura NULLs e verifica que o estado volta
printf '\n============ BLOCO C — rollback ============\n'
psql_test -c "
UPDATE storage.buckets SET file_size_limit = NULL WHERE name = 'whatsapp-media';
UPDATE storage.buckets SET file_size_limit = NULL WHERE name = 'audio-messages';
UPDATE storage.buckets SET file_size_limit = NULL WHERE name = 'multiplix-voice';
" >/dev/null

WAM_ROLLBACK="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='whatsapp-media';")"
AM_ROLLBACK="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='audio-messages';")"
MV_ROLLBACK="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='multiplix-voice';")"

[[ "$WAM_ROLLBACK" == 't' ]] || fail "Rollback: whatsapp-media file_size_limit deveria ser NULL"
[[ "$AM_ROLLBACK" == 't' ]] || fail "Rollback: audio-messages file_size_limit deveria ser NULL"
[[ "$MV_ROLLBACK" == 't' ]] || fail "Rollback: multiplix-voice file_size_limit deveria ser NULL"
printf '[PASS] C.1-C.3 rollback restaura NULLs nos tres buckets\n'

# Reaplica a migration (idempotencia)
printf '\n============ BLOCO D — idempotencia ============\n'
psql_test < "$migration" >/dev/null || fail 'D.0 reaplicacao da migration falhou'

WAM_REAPPLY="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';")"
AM_REAPPLY="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';")"
MV_REAPPLY="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';")"

[[ "$WAM_REAPPLY" == '26214400' ]] || fail "D.1 reaplicacao: whatsapp-media deveria ter file_size_limit=26214400"
[[ "$AM_REAPPLY" == '26214400' ]] || fail "D.2 reaplicacao: audio-messages deveria ter file_size_limit=26214400"
[[ "$MV_REAPPLY" == '52428800' ]] || fail "D.3 reaplicacao: multiplix-voice deveria ter file_size_limit=52428800"
printf '[PASS] D.1-D.3 migration idempotente: reaplicacao funciona\n'

printf '\nPASS: N-009 — storage.buckets UPDATE define file_size_limit em whatsapp-media (25MB), audio-messages (25MB) e multiplix-voice (50MB).\n'