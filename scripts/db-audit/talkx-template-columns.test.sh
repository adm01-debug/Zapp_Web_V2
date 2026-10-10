#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_TEMPLATE_COLUMNS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-template-columns-$RANDOM-$$"
test_password="talkx_template_columns_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-template-columns-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" = true ]] || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# Precreate the Supabase runtime surface (roles, auth schema, helpers).
psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
SQL

# Create the talkx_templates table with the pre-migration schema (existing columns only).
psql_test >/dev/null <<'SQL'
CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  content text NOT NULL,
  media_url text,
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  custom_variables jsonb DEFAULT '{}',
  current_version_id uuid
);
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
SQL

migration_file="${repo_root}/supabase/migrations/20261010085042_talkx_templates_channel_icon_media_archive.sql"
[[ -f "$migration_file" ]] || fail "Arquivo de migration nao encontrado: $migration_file"

# Apply the migration real (pipe via stdin so psql reads from the host file).
psql_test < "$migration_file" >/dev/null || fail "Falha ao aplicar a migration"

# Apply the media_type migration (additive, only adds the missing column).
media_type_migration="${repo_root}/supabase/migrations/20261011000012_talkx_templates_add_media_type.sql"
[[ -f "$media_type_migration" ]] || fail "Arquivo de migration nao encontrado: $media_type_migration"
psql_test < "$media_type_migration" >/dev/null || fail "Falha ao aplicar a migration de media_type"

# Verify the new columns exist.
for col in channel icon interactive media_file_name media_type media_size_bytes media_width media_height archived_at; do
  psql_test -v col="$col" -Atqc "SELECT 1 FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='$col'" | grep -q '^1$' || fail "Coluna $col nao existe apos a migration"
done

# Verify channel default is 'whatsapp'.
default_val="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='channel'")"
[[ "$default_val" == *"'whatsapp'"* ]] || fail "Channel default nao e 'whatsapp': $default_val"

# Verify CHECK constraint on channel (only 'whatsapp' allowed).
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, channel) VALUES ('bad', 'content', 'telegram')" 2>&1 && fail "INSERT com channel='telegram' deveria ter falhado"

# Verify icon length CHECK (max 16 chars).
long_icon_val="this_icon_is_way_too_long_for_template"
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, icon) VALUES ('bad', 'content', '${long_icon_val}')" 2>&1 && fail "INSERT com icon > 16 chars deveria ter falhado"

# Verify valid icon (16 chars exactly) works.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, icon) VALUES ('ok', 'content', '1234567890123456')" >/dev/null || fail "INSERT com icon de 16 chars deveria ter sucedido"

# Verify media metadata columns accept values.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_file_name, media_size_bytes, media_width, media_height) VALUES ('media', 'content', 'photo.jpg', 102400, 1920, 1080)" >/dev/null || fail "INSERT com metadados de midia deveria ter sucedido"

# Verify media_type CHECK constraint rejects invalid values.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_type) VALUES ('bad', 'content', 'exe')" 2>&1 && fail "INSERT com media_type='exe' deveria ter falhado"

# Verify media_type accepts valid values.
for mt in image video document audio; do
  psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_type) VALUES ('ok_${mt}', 'content', '${mt}')" >/dev/null || fail "INSERT com media_type='${mt}' deveria ter sucedido"
done

# Verify archived_at accepts a timestamptz value.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, archived_at) VALUES ('archived', 'content', '2026-01-01T00:00:00Z')" >/dev/null || fail "INSERT com archived_at deveria ter sucedido"

# Verify interactive jsonb column accepts valid JSON.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, interactive) VALUES ('interactive', 'content', '{\"type\":\"button\",\"buttons\":[]}')" >/dev/null || fail "INSERT com interactive jsonb deveria ter sucedido"

printf '[PASS] talkx_templates columns migration applied and verified\n'