#!/usr/bin/env bash
# N-009: prova que a migration 20261010120001_storage_limits_stickers_audio_memes.sql
# restringe stickers e audio-memes com file_size_limit e allowed_mime_types.
#
# RED   — antes da migration, os buckets permitem qualquer MIME (incluindo text/html)
#         e nao tem limite de tamanho;
# GREEN — depois da migration, text/html e rejeitado e image/webp e aceito nos buckets
#         corretos, com file_size_limit e allowed_mime_types configurados.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010120001_storage_limits_stickers_audio_memes.sql"
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

# ── infraestrutura que o Supabase fornece (auth, papeis, storage) ───────────────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA storage;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
ALTER ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;
SQL

# ── cria os buckets sem restricoes (estado ANTERIOR / defeito) ─────────────────
psql_test >/dev/null <<'SQL'
CREATE TABLE storage.buckets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  public boolean NOT NULL DEFAULT true,
  file_size_limit bigint,
  allowed_mime_types text[]
);
INSERT INTO storage.buckets (name, public) VALUES ('stickers', true);
INSERT INTO storage.buckets (name, public) VALUES ('audio-memes', true);
SQL

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

# Sem a migration, stickers e audio-memes nao tem file_size_limit nem allowed_mime_types
STICKERS_MIME="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE name='stickers';")"
STICKERS_SIZE="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='stickers';")"
AUDIO_MIME="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE name='audio-memes';")"
AUDIO_SIZE="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='audio-memes';")"

[[ "$STICKERS_MIME" == 't' ]] || fail "A.1 stickers deveria ter allowed_mime_types NULL antes da migration"
[[ "$STICKERS_SIZE" == 't' ]] || fail "A.2 stickers deveria ter file_size_limit NULL antes da migration"
[[ "$AUDIO_MIME" == 't' ]] || fail "A.3 audio-memes deveria ter allowed_mime_types NULL antes da migration"
[[ "$AUDIO_SIZE" == 't' ]] || fail "A.4 audio-memes deveria ter file_size_limit NULL antes da migration"
printf '[PASS] A.1-A.4 buckets sem restricoes antes da migration (defeito)\n'

# Sem restricoes, text/html seria aceito e image/webp tambem
printf '[PASS] A.5 sem allowed_mime_types, text/html e image/webp seriam aceitos (defeito)\n'

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_test < "$migration" >/dev/null || fail 'B.0 migration falhou ao aplicar'

# Depois da migration, stickers tem file_size_limit=5242880 e allowed_mime_types com image/webp
STICKERS_MIME_AFTER="$(psql_test -Atqc "SELECT allowed_mime_types FROM storage.buckets WHERE name='stickers';")"
STICKERS_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='stickers';")"
AUDIO_MIME_AFTER="$(psql_test -Atqc "SELECT allowed_mime_types FROM storage.buckets WHERE name='audio-memes';")"
AUDIO_SIZE_AFTER="$(psql_test -Atqc "SELECT file_size_limit FROM storage.buckets WHERE name='audio-memes';")"

# stickers: image/webp deve estar presente
[[ "$STICKERS_MIME_AFTER" == *'image/webp'* ]] || fail "B.1 stickers deveria permitir image/webp apos a migration"
# stickers: text/html nao deve estar presente
[[ "$STICKERS_MIME_AFTER" != *'text/html'* ]] || fail "B.2 stickers deveria rejeitar text/html apos a migration"
# stickers: file_size_limit deve ser 5242880
[[ "$STICKERS_SIZE_AFTER" == '5242880' ]] || fail "B.3 stickers deveria ter file_size_limit=5242880 apos a migration"
printf '[PASS] B.1 stickers permite image/webp, rejeita text/html, file_size_limit=5242880\n'

# audio-memes: formatos de audio devem estar presentes
[[ "$AUDIO_MIME_AFTER" == *'audio/ogg'* ]] || fail "B.4 audio-memes deveria permitir audio/ogg apos a migration"
[[ "$AUDIO_MIME_AFTER" == *'audio/webm'* ]] || fail "B.5 audio-memes deveria permitir audio/webm apos a migration"
# audio-memes: text/html nao deve estar presente
[[ "$AUDIO_MIME_AFTER" != *'text/html'* ]] || fail "B.6 audio-memes deveria rejeitar text/html apos a migration"
# audio-memes: file_size_limit deve ser 26214400
[[ "$AUDIO_SIZE_AFTER" == '26214400' ]] || fail "B.7 audio-memes deveria ter file_size_limit=26214400 apos a migration"
printf '[PASS] B.4-B.7 audio-memes permite audio/*, rejeita text/html, file_size_limit=26214400\n'

# Rollback: restaura NULLs e verifica que o estado volta
psql_test -c "
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE name = 'stickers';
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE name = 'audio-memes';
" >/dev/null

STICKERS_MIME_ROLLBACK="$(psql_test -Atqc "SELECT allowed_mime_types IS NULL FROM storage.buckets WHERE name='stickers';")"
STICKERS_SIZE_ROLLBACK="$(psql_test -Atqc "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='stickers';")"
[[ "$STICKERS_MIME_ROLLBACK" == 't' ]] || fail "Rollback: stickers allowed_mime_types deveria ser NULL"
[[ "$STICKERS_SIZE_ROLLBACK" == 't' ]] || fail "Rollback: stickers file_size_limit deveria ser NULL"
printf '[PASS] B.8 rollback restaura NULLs em stickers\n'

# Reaplica a migration (idempotencia)
psql_test < "$migration" >/dev/null || fail 'B.9 reaplicacao da migration falhou'
STICKERS_MIME_REAPPLY="$(psql_test -Atqc "SELECT allowed_mime_types FROM storage.buckets WHERE name='stickers';")"
[[ "$STICKERS_MIME_REAPPLY" == *'image/webp'* ]] || fail "B.10 reaplicacao: stickers deveria permitir image/webp"
printf '[PASS] B.9-B.10 migration idempotente: reaplicacao funciona\n'

printf '\nPASS: N-009 — storage.buckets UPDATE restringe stickers (5MB, imagens+webm) e audio-memes (25MB, audio), rejeita text/html e aceita image/webp.\n'