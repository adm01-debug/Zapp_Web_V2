#!/usr/bin/env bash
# N-009: prova que a migration 20261010000005_storage_limits_whatsapp_audio_multiplex.sql
# restringe whatsapp-audio e multiplix-audio com file_size_limit e allowed_mime_types.
#
# RED   — antes da migration, ambos os buckets tem file_size_limit NULL e
#         allowed_mime_types NULL (aceitam qualquer MIME);
# GREEN — depois da migration, whatsapp-audio tem file_size_limit=26214400 e 5
#         MIMEs audio/*; multiplix-audio tem file_size_limit=52428800 e inclui
#         audio/* + video/mp4; rollback do cabecalho restaura NULLs e a
#         reaplicacao volta ao GREEN.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010000005_storage_limits_whatsapp_audio_multiplex.sql"
postgres_image="${STORAGE_LIMITS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-storage-limits-test-$$"
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

[[ -f "$migration" ]] || fail "migration ausente: $migration"

# ── infraestrutura minima que o Supabase fornece (storage) ────────────────────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-audio', 'whatsapp-audio', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('multiplix-audio', 'multiplix-audio', false);
SQL

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

WA_MIME="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='whatsapp-audio';")"
WA_SIZE="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='whatsapp-audio';")"
MX_MIME="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='multiplix-audio';")"
MX_SIZE="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='multiplix-audio';")"

[[ "$WA_MIME" == 't' ]] || fail "A.1 whatsapp-audio deveria ter allowed_mime_types NULL antes da migration"
[[ "$WA_SIZE" == 't' ]] || fail "A.2 whatsapp-audio deveria ter file_size_limit NULL antes da migration"
[[ "$MX_MIME" == 't' ]] || fail "A.3 multiplix-audio deveria ter allowed_mime_types NULL antes da migration"
[[ "$MX_SIZE" == 't' ]] || fail "A.4 multiplix-audio deveria ter file_size_limit NULL antes da migration"
printf '[PASS] A.1-A.4 buckets sem restricoes antes da migration (defeito)\n'

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_test < "$migration" >/dev/null || fail 'B.0 migration falhou ao aplicar'

WA_MIME_AFTER="$(psql_test -Atqc "SELECT allowed_mime_types FROM storage.buckets WHERE id='whatsapp-audio';")"
WA_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='whatsapp-audio';")"
MX_MIME_AFTER="$(psql_test -Atqc "SELECT allowed_mime_types FROM storage.buckets WHERE id='multiplix-audio';")"
MX_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='multiplix-audio';")"

# whatsapp-audio: 26214400 e 5 MIMEs audio/*
[[ "$WA_SIZE_AFTER" == '26214400' ]] || fail "B.1 whatsapp-audio deveria ter file_size_limit=26214400 apos a migration (obteve $WA_SIZE_AFTER)"
[[ "$WA_MIME_AFTER" == *'audio/ogg'* ]] || fail "B.2 whatsapp-audio deveria permitir audio/ogg apos a migration"
[[ "$WA_MIME_AFTER" == *'audio/mpeg'* ]] || fail "B.3 whatsapp-audio deveria permitir audio/mpeg apos a migration"
[[ "$WA_MIME_AFTER" == *'audio/wav'* ]] || fail "B.4 whatsapp-audio deveria permitir audio/wav apos a migration"
[[ "$WA_MIME_AFTER" == *'audio/aac'* ]] || fail "B.5 whatsapp-audio deveria permitir audio/aac apos a migration"
[[ "$WA_MIME_AFTER" == *'audio/webm'* ]] || fail "B.6 whatsapp-audio deveria permitir audio/webm apos a migration"
[[ "$WA_MIME_AFTER" != *'text/html'* ]] || fail "B.7 whatsapp-audio nao deveria permitir text/html apos a migration"
printf '[PASS] B.1-B.7 whatsapp-audio com 26214400 e 5 MIMEs audio/*, sem text/html\n'

# multiplix-audio: 52428800 e audio/* + video/mp4
[[ "$MX_SIZE_AFTER" == '52428800' ]] || fail "B.8 multiplix-audio deveria ter file_size_limit=52428800 apos a migration (obteve $MX_SIZE_AFTER)"
[[ "$MX_MIME_AFTER" == *'audio/ogg'* ]] || fail "B.9 multiplix-audio deveria permitir audio/ogg apos a migration"
[[ "$MX_MIME_AFTER" == *'audio/mpeg'* ]] || fail "B.10 multiplix-audio deveria permitir audio/mpeg apos a migration"
[[ "$MX_MIME_AFTER" == *'video/mp4'* ]] || fail "B.11 multiplix-audio deveria permitir video/mp4 apos a migration"
[[ "$MX_MIME_AFTER" != *'text/html'* ]] || fail "B.12 multiplix-audio nao deveria permitir text/html apos a migration"
printf '[PASS] B.8-B.12 multiplix-audio com 52428800, audio/* + video/mp4, sem text/html\n'

# Rollback: extrai a linha "-- Rollback:" do cabecalho da migration e executa de verdade
ROLLBACK_SQL="$(grep '^-- Rollback:' "$migration" | sed 's/^-- Rollback: //')"
[[ -n "$ROLLBACK_SQL" ]] || fail "B.13 cabecalho da migration sem linha '-- Rollback:' executavel"
psql_test -c "$ROLLBACK_SQL" >/dev/null || fail 'B.13 rollback do cabecalho falhou ao executar'

WA_MIME_RB="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='whatsapp-audio';")"
WA_SIZE_RB="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='whatsapp-audio';")"
MX_MIME_RB="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='multiplix-audio';")"
MX_SIZE_RB="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='multiplix-audio';")"
[[ "$WA_MIME_RB" == 't' ]] || fail "B.14 rollback: whatsapp-audio allowed_mime_types deveria voltar a NULL"
[[ "$WA_SIZE_RB" == 't' ]] || fail "B.15 rollback: whatsapp-audio file_size_limit deveria voltar a NULL"
[[ "$MX_MIME_RB" == 't' ]] || fail "B.16 rollback: multiplix-audio allowed_mime_types deveria voltar a NULL"
[[ "$MX_SIZE_RB" == 't' ]] || fail "B.17 rollback: multiplix-audio file_size_limit deveria voltar a NULL"
printf '[PASS] B.13-B.17 rollback do cabecalho restaura NULLs nos dois buckets\n'

# Reaplicacao (idempotencia): volta ao GREEN
psql_test < "$migration" >/dev/null || fail 'B.18 reaplicacao da migration falhou'
WA_SIZE_RE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='whatsapp-audio';")"
MX_SIZE_RE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='multiplix-audio';")"
[[ "$WA_SIZE_RE" == '26214400' ]] || fail "B.19 reaplicacao: whatsapp-audio deveria voltar a 26214400"
[[ "$MX_SIZE_RE" == '52428800' ]] || fail "B.20 reaplicacao: multiplix-audio deveria voltar a 52428800"
printf '[PASS] B.18-B.20 migration idempotente: reaplicacao volta ao GREEN\n'

printf '\nPASS: N-009 — whatsapp-audio (25MB, 5 audio/*) e multiplix-audio (50MB, audio/* + video/mp4) restritos; rollback restaura NULLs.\n'
