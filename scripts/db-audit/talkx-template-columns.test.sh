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

# Minimal Supabase runtime surface for the disposable Postgres.
psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid NOT NULL PRIMARY KEY);
ALTER TABLE auth.users REPLICA IDENTITY NOTHING;

CREATE TABLE public.profiles (id uuid NOT NULL PRIMARY KEY, user_id uuid);
ALTER TABLE public.profiles REPLICA IDENTITY NOTHING;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false
$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
SQL

# Create talkx_templates with the pre-migration schema (as created by 20260908120000).
# This is the real schema that the target migration modifies.
psql_test >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL,
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'approved',
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_templates_status_check CHECK (status IN ('draft','review','approved')),
  CONSTRAINT talkx_templates_media_type_check CHECK (media_type IS NULL OR media_type IN ('image','video','document','audio'))
);
CREATE INDEX IF NOT EXISTS idx_talkx_templates_created_by ON public.talkx_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_talkx_templates_category ON public.talkx_templates(category);
CREATE TRIGGER update_talkx_templates_updated_at BEFORE UPDATE ON public.talkx_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_templates_select" ON public.talkx_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "talkx_templates_insert" ON public.talkx_templates FOR INSERT
  WITH CHECK (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "talkx_templates_update" ON public.talkx_templates FOR UPDATE
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "talkx_templates_delete" ON public.talkx_templates FOR DELETE
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));
SQL

# Apply the target migration (real migration from the repo).
target_migration="${repo_root}/supabase/migrations/20261010085042_talkx_templates_channel_icon_media_archive.sql"
[[ -f "$target_migration" ]] || fail "Migration alvo nao encontrada: $target_migration"

# RED proof: before the target migration, the new columns should not exist.
for col in channel icon interactive media_file_name media_size_bytes media_width media_height archived_at; do
  exists="$(psql_test -Atqc "SELECT 1 FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='$col'")"
  [[ "$exists" == "1" ]] && fail "Coluna $col existia ANTES da migration (nao e aditiva)"
done

# Apply the target migration.
psql_test < "$target_migration" >/dev/null || fail "Falha ao aplicar migration alvo"

# GREEN proof: after the target migration, the new columns should exist.
for col in channel icon interactive media_file_name media_size_bytes media_width media_height archived_at; do
  psql_test -v col="$col" -Atqc "SELECT 1 FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='$col'" | grep -q '^1$' || fail "Coluna $col nao existe apos a migration"
done

# Verify media_type already exists (reused from 20260908120000, not recreated).
psql_test -Atqc "SELECT 1 FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='media_type'" | grep -q '^1$' || fail "Coluna media_type nao existe (esperada da migration 20260908120000)"

# Verify channel default is 'whatsapp'.
default_val="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='channel'")"
[[ "$default_val" == *"'whatsapp'"* ]] || fail "Channel default nao e 'whatsapp': $default_val"

# Verify 'whatsapp' as default value is stored in an inserted row.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content) VALUES ('whatsapp-row', 'content')" >/dev/null || fail "INSERT com default channel deveria ter sucedido"
channel_default="$(psql_test -Atqc "SELECT channel FROM public.talkx_templates WHERE name='whatsapp-row'")"
[[ "$channel_default" == "whatsapp" ]] || fail "Channel default gravado nao e 'whatsapp': $channel_default"

# Verify archived_at is null by default.
archived_default="$(psql_test -Atqc "SELECT archived_at FROM public.talkx_templates WHERE name='whatsapp-row'")"
[[ "$archived_default" == "" ]] || fail "archived_at default nao e null: $archived_default"

# Verify reading equal to today (old rows keep their values, new rows get current timestamp).
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, archived_at) VALUES ('archived-row', 'content', '2026-01-01T00:00:00Z')" >/dev/null || fail "INSERT com archived_at deveria ter sucedido"
archived_read="$(psql_test -Atqc "SELECT archived_at::text FROM public.talkx_templates WHERE name='archived-row'")"
[[ "$archived_read" == "2026-01-01 00:00:00+00" ]] || fail "archived_at leitura difere do gravado: $archived_read"

# Verify CHECK constraint on channel (only 'whatsapp' allowed).
if psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, channel) VALUES ('bad-channel', 'content', 'telegram')" 2>&1; then
  fail "INSERT com channel='telegram' deveria ter falhado"
fi

# Verify icon length CHECK (max 16 chars).
long_icon_val="this_icon_is_way_too_long_for_template"
if psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, icon) VALUES ('bad-icon', 'content', '${long_icon_val}')" 2>&1; then
  fail "INSERT com icon > 16 chars deveria ter falhado"
fi

# Verify valid icon (16 chars exactly) works.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, icon) VALUES ('ok-icon', 'content', '1234567890123456')" >/dev/null || fail "INSERT com icon de 16 chars deveria ter sucedido"

# Verify media metadata columns accept values.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_file_name, media_size_bytes, media_width, media_height) VALUES ('media-row', 'content', 'photo.jpg', 102400, 1920, 1080)" >/dev/null || fail "INSERT com metadados de midia deveria ter sucedido"

# Verify media_type CHECK constraint rejects invalid values.
if psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_type) VALUES ('bad-type', 'content', 'exe')" 2>&1; then
  fail "INSERT com media_type='exe' deveria ter falhado"
fi

# Verify media_type accepts valid values.
for mt in image video document audio; do
  psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_type) VALUES ('ok_${mt}', 'content', '${mt}')" >/dev/null || fail "INSERT com media_type='${mt}' deveria ter sucedido"
done

# Verify interactive jsonb column accepts valid JSON.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, interactive) VALUES ('interactive-row', 'content', '{\"type\":\"button\",\"buttons\":[]}')" >/dev/null || fail "INSERT com interactive jsonb deveria ter sucedido"

# Prove additive only: the set of old columns is unchanged.
for col in id name description category content media_url media_type tags status use_count created_by created_at updated_at; do
  psql_test -v col="$col" -Atqc "SELECT 1 FROM information_schema.columns WHERE table_name='talkx_templates' AND column_name='$col'" | grep -q '^1$' || fail "Coluna original $col foi removida (nao e aditiva)"
done

# Prove RLS policies and reading work with authenticated role.
psql_test >/dev/null <<'SQL'
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) FROM public.talkx_templates;
RESET ROLE;
SQL

printf '[PASS] talkx_templates columns migration applied and verified\n'