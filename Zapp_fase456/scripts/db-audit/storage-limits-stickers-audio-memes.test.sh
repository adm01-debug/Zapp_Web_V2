#!/usr/bin/env bash
# N-009 (SEC-DEFINER_GRANTS_STORAGE-06): prova que a migration
# 20261011003015_storage_limits_stickers_audio_memes.sql restringe os buckets
# publicos de figurinhas (stickers) e audios-meme (audio-memes) com
# file_size_limit e allowed_mime_types.
#
# RED   — antes da migration, ambos os buckets tem file_size_limit NULL e
#         allowed_mime_types NULL (aceitam qualquer MIME, inclusive text/html);
# GREEN — depois da migration, stickers tem file_size_limit=512000 e 4 MIMEs
#         de imagem (com image/webp); audio-memes tem file_size_limit=5242880
#         e 5 MIMEs de audio; rollback do cabecalho restaura NULLs e a
#         reaplicacao volta ao GREEN.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011003015_storage_limits_stickers_audio_memes.sql"
postgres_image="${STICKERS_MEMES_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-storage-stickers-memes-test-$$"
test_password="stickers-memes-test-only"

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
# Buckets criados como public=true, como em producao (20260511233306).
psql_test >/dev/null <<'SQL'
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
INSERT INTO storage.buckets (id, name, public) VALUES ('stickers', 'stickers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-memes', 'audio-memes', true);
SQL

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

ST_MIME="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='stickers';")"
ST_SIZE="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='stickers';")"
AM_MIME="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='audio-memes';")"
AM_SIZE="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='audio-memes';")"
ST_PUB="$(psql_test -Atqc "SELECT public FROM storage.buckets WHERE id='stickers';")"
AM_PUB="$(psql_test -Atqc "SELECT public FROM storage.buckets WHERE id='audio-memes';")"
[[ "$ST_MIME" == 't' ]] || fail "A.1 defeito nao reproduzido: stickers allowed_mime_types deveria ser NULL antes"
[[ "$ST_SIZE" == 't' ]] || fail "A.2 defeito nao reproduzido: stickers file_size_limit deveria ser NULL antes"
[[ "$AM_MIME" == 't' ]] || fail "A.3 defeito nao reproduzido: audio-memes allowed_mime_types deveria ser NULL antes"
[[ "$AM_SIZE" == 't' ]] || fail "A.4 defeito nao reproduzido: audio-memes file_size_limit deveria ser NULL antes"
[[ "$ST_PUB" == 't' ]] || fail "A.5 setup: stickers deveria ser public=true como em producao"
[[ "$AM_PUB" == 't' ]] || fail "A.6 setup: audio-memes deveria ser public=true como em producao"
printf '[PASS] A.1-A.6 defeito reproduzido: stickers e audio-memes publicos sem limite nem MIME\n'

printf '\n============ BLOCO B — aplica a migration e prova o GREEN ============\n'

psql_test < "$migration" >/dev/null || fail 'B.0 migration falhou ao aplicar'

ST_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='stickers';")"
AM_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='audio-memes';")"
[[ "$ST_SIZE_AFTER" == '512000' ]] || fail "B.1 stickers file_size_limit deveria ser 512000 (obteve $ST_SIZE_AFTER)"
[[ "$AM_SIZE_AFTER" == '5242880' ]] || fail "B.2 audio-memes file_size_limit deveria ser 5242880 (obteve $AM_SIZE_AFTER)"
printf '[PASS] B.1-B.2 file_size_limit: stickers=512000, audio-memes=5242880\n'

ST_MIMES="$(psql_test -Atqc "SELECT array_to_string(allowed_mime_types, ',') FROM storage.buckets WHERE id='stickers';")"
AM_MIMES="$(psql_test -Atqc "SELECT array_to_string(allowed_mime_types, ',') FROM storage.buckets WHERE id='audio-memes';")"
[[ "$ST_MIMES" == 'image/png,image/webp,image/gif,image/jpeg' ]] || fail "B.3 stickers allowed_mime_types inesperado: $ST_MIMES"
[[ "$AM_MIMES" == 'audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/aac' ]] || fail "B.4 audio-memes allowed_mime_types inesperado: $AM_MIMES"
printf '[PASS] B.3-B.4 allowed_mime_types exatos nos dois buckets\n'

# Criterio do cartao pelo comportamento (ANY), como papel real (authenticated).
psql_test >/dev/null <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOSUPERUSER NOLOGIN;
  END IF;
END $$;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT USAGE ON SCHEMA storage TO authenticated;
SQL
AUTH_Q() { psql_test -Atqc "SET ROLE authenticated; SELECT $1; RESET ROLE;"; }
ST_HTML="$(AUTH_Q "'text/html' = ANY (SELECT unnest(allowed_mime_types) FROM storage.buckets WHERE id='stickers')")"
ST_WEBP="$(AUTH_Q "'image/webp' = ANY (SELECT unnest(allowed_mime_types) FROM storage.buckets WHERE id='stickers')")"
ST_SVG="$(AUTH_Q "'image/svg+xml' = ANY (SELECT unnest(allowed_mime_types) FROM storage.buckets WHERE id='stickers')")"
AM_HTML="$(AUTH_Q "'text/html' = ANY (SELECT unnest(allowed_mime_types) FROM storage.buckets WHERE id='audio-memes')")"
AM_MPEG="$(AUTH_Q "'audio/mpeg' = ANY (SELECT unnest(allowed_mime_types) FROM storage.buckets WHERE id='audio-memes')")"
AM_MP4="$(AUTH_Q "'video/mp4' = ANY (SELECT unnest(allowed_mime_types) FROM storage.buckets WHERE id='audio-memes')")"
[[ "$ST_HTML" == 'f' ]] || fail "B.5 comportamento: 'text/html' = ANY(stickers) deveria ser f (obteve $ST_HTML)"
[[ "$ST_WEBP" == 't' ]] || fail "B.6 comportamento: 'image/webp' = ANY(stickers) deveria ser t (obteve $ST_WEBP)"
[[ "$ST_SVG" == 'f' ]] || fail "B.7 comportamento: 'image/svg+xml' = ANY(stickers) deveria ser f (obteve $ST_SVG)"
[[ "$AM_HTML" == 'f' ]] || fail "B.8 comportamento: 'text/html' = ANY(audio-memes) deveria ser f (obteve $AM_HTML)"
[[ "$AM_MPEG" == 't' ]] || fail "B.9 comportamento: 'audio/mpeg' = ANY(audio-memes) deveria ser t (obteve $AM_MPEG)"
[[ "$AM_MP4" == 'f' ]] || fail "B.10 comportamento: 'video/mp4' = ANY(audio-memes) deveria ser f (bucket so de audio, obteve $AM_MP4)"
printf '[PASS] B.5-B.10 criterio pelo comportamento (ANY) como authenticated: text/html=f nos dois, image/webp=t em stickers, audio/mpeg=t em audio-memes\n'

# Rollback: a linha '-- Rollback:' do cabecalho e SQL executavel; roda de verdade.
ROLLBACK_SQL="$(grep '^-- Rollback: ' "$migration" | sed 's/^-- Rollback: //')"
[[ -n "$ROLLBACK_SQL" ]] || fail "B.11 cabecalho da migration sem linha '-- Rollback:' com SQL executavel"
psql_test -c "$ROLLBACK_SQL" >/dev/null || fail 'B.11 rollback do cabecalho falhou ao executar'

ST_MIME_RB="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='stickers';")"
ST_SIZE_RB="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='stickers';")"
AM_MIME_RB="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE id='audio-memes';")"
AM_SIZE_RB="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE id='audio-memes';")"
[[ "$ST_MIME_RB" == 't' ]] || fail "B.12 rollback: stickers allowed_mime_types deveria voltar a NULL"
[[ "$ST_SIZE_RB" == 't' ]] || fail "B.13 rollback: stickers file_size_limit deveria voltar a NULL"
[[ "$AM_MIME_RB" == 't' ]] || fail "B.14 rollback: audio-memes allowed_mime_types deveria voltar a NULL"
[[ "$AM_SIZE_RB" == 't' ]] || fail "B.15 rollback: audio-memes file_size_limit deveria voltar a NULL"
printf '[PASS] B.11-B.15 rollback do cabecalho restaura NULLs nos dois buckets\n'

# Reaplicacao (idempotencia): volta ao GREEN
psql_test < "$migration" >/dev/null || fail 'B.16 reaplicacao da migration falhou'
ST_SIZE_RE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='stickers';")"
AM_SIZE_RE="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE id='audio-memes';")"
[[ "$ST_SIZE_RE" == '512000' ]] || fail "B.17 reaplicacao: stickers deveria voltar a 512000"
[[ "$AM_SIZE_RE" == '5242880' ]] || fail "B.18 reaplicacao: audio-memes deveria voltar a 5242880"
printf '[PASS] B.16-B.18 migration idempotente: reaplicacao volta ao GREEN\n'

printf '\nPASS: N-009 — stickers (500KB, 4 imagens com webp) e audio-memes (5MB, 5 audios) restritos; text/html recusado; rollback restaura NULLs.\n'
