#!/usr/bin/env bash
set -Eeuo pipefail
# N-126 (P3) — Talk X banco: colunas de canal, icone, midia e arquivamento em talkx_templates.
# Prova em Postgres descartavel, em um so container e em ordem:
#   BLOCO A — estado ANTERIOR (defeito): tabela criada pela migration REAL
#             20260908120000; as 8 colunas novas NAO existem.
#   BLOCO B — migration alvo aplicada (arquivo REAL 20261010085042): colunas
#             existem, defaults/checks valem, leitura igual a gravada, aditiva.
#   BLOCO C — papel real: leitura como authenticated dentro de transacao
#             (BEGIN + SET LOCAL) devolve as mesmas linhas e valores.
# A tabela sob teste NUNCA e recriada a mao: ela vem da migration real.
# So os pre-requisitos de outras migrations (roles, auth, profiles, helpers e
# stubs de talkx_campaigns/talkx_blacklist, que a base 20260908120000 altera)
# sao minimos — sem eles o arquivo real nao aplica.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_migration="${repo_root}/supabase/migrations/20260908120000_talkx_segments_templates_events.sql"
migration="${repo_root}/supabase/migrations/20261010085042_talkx_templates_channel_icon_media_archive.sql"
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

# Pre-requisitos minimos de OUTRAS migrations (nao da tabela sob teste).
psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid NOT NULL PRIMARY KEY);
CREATE TABLE public.profiles (id uuid NOT NULL PRIMARY KEY, user_id uuid);
CREATE TABLE public.talkx_campaigns (id uuid NOT NULL PRIMARY KEY, status text, scheduled_at timestamptz, created_by uuid);
CREATE TABLE public.talkx_blacklist (id uuid NOT NULL PRIMARY KEY);

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

# Tabela sob teste vem da migration REAL que a criou (inclui media_type e as policies RLS).
[[ -f "$base_migration" ]] || fail "Migration base nao encontrada: $base_migration"
psql_test < "$base_migration" >/dev/null || fail "Falha ao aplicar a migration real 20260908120000"

# BLOCO A — defeito: as 8 colunas novas ainda nao existem.
for col in channel icon interactive media_file_name media_size_bytes media_width media_height archived_at; do
  count="$(psql_test -Atqc "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='$col'")"
  [[ "$count" == "0" ]] || fail "BLOCO A: coluna $col ja existe antes da migration alvo"
done
printf '[PASS] BLOCO A — sem a migration alvo as 8 colunas nao existem\n'

# Migration alvo (arquivo REAL).
[[ -f "$migration" ]] || fail "Arquivo de migration nao encontrado: $migration"
psql_test < "$migration" >/dev/null || fail "Falha ao aplicar a migration alvo"

# Em producao o GRANT vem das migrations de papeis da base; aqui o minimo para a prova de papel real.
psql_test -Atqc "GRANT SELECT ON public.talkx_templates TO authenticated" >/dev/null || fail "Falha ao conceder SELECT a authenticated"

# BLOCO B — correcao: colunas existem, defaults/checks valem, leitura igual, aditiva.
for col in channel icon interactive media_file_name media_size_bytes media_width media_height archived_at; do
  psql_test -Atqc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='$col'" | grep -q '^1$' || fail "BLOCO B: coluna $col nao existe apos a migration"
done

# media_type continua vindo da base real (nao recriada por este cartao).
psql_test -Atqc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='media_type'" | grep -q '^1$' || fail "BLOCO B: coluna media_type da base sumiu (nao e aditiva)"

# channel default e 'whatsapp' no catalogo e na linha gravada.
default_val="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='channel'")"
[[ "$default_val" == *"'whatsapp'"* ]] || fail "BLOCO B: channel default nao e 'whatsapp': $default_val"
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content) VALUES ('whatsapp-row', 'content')" >/dev/null || fail "BLOCO B: INSERT com default channel deveria ter sucedido"
[[ "$(psql_test -Atqc "SELECT channel FROM public.talkx_templates WHERE name='whatsapp-row'")" == "whatsapp" ]] || fail "BLOCO B: channel default gravado nao e 'whatsapp'"

# archived_at nulo por padrao.
[[ -z "$(psql_test -Atqc "SELECT archived_at FROM public.talkx_templates WHERE name='whatsapp-row'")" ]] || fail "BLOCO B: archived_at default nao e null"

# Leitura igual a gravada.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, archived_at) VALUES ('archived-row', 'content', '2026-01-01T00:00:00Z')" >/dev/null || fail "BLOCO B: INSERT com archived_at deveria ter sucedido"
[[ "$(psql_test -Atqc "SELECT archived_at::text FROM public.talkx_templates WHERE name='archived-row'")" == "2026-01-01 00:00:00+00" ]] || fail "BLOCO B: archived_at leitura difere do gravado"

# channel aceita so whatsapp.
if psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, channel) VALUES ('bad-channel', 'content', 'telegram')" 2>&1; then
  fail "BLOCO B: INSERT com channel='telegram' deveria ter falhado"
fi

# icon: rejeita >16, aceita 16 exatos.
if psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, icon) VALUES ('bad-icon', 'content', 'this_icon_is_way_too_long_for_template')" 2>&1; then
  fail "BLOCO B: INSERT com icon > 16 chars deveria ter falhado"
fi
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, icon) VALUES ('ok-icon', 'content', '1234567890123456')" >/dev/null || fail "BLOCO B: INSERT com icon de 16 chars deveria ter sucedido"

# Metadados de midia.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_file_name, media_size_bytes, media_width, media_height) VALUES ('media-row', 'content', 'photo.jpg', 102400, 1920, 1080)" >/dev/null || fail "BLOCO B: INSERT com metadados de midia deveria ter sucedido"

# media_type da base: rejeita 'exe', aceita os 4 validos.
if psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_type) VALUES ('bad-type', 'content', 'exe')" 2>&1; then
  fail "BLOCO B: INSERT com media_type='exe' deveria ter falhado"
fi
for mt in image video document audio; do
  psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, media_type) VALUES ('ok_${mt}', 'content', '${mt}')" >/dev/null || fail "BLOCO B: INSERT com media_type='${mt}' deveria ter sucedido"
done

# interactive jsonb.
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content, interactive) VALUES ('interactive-row', 'content', '{\"type\":\"button\",\"buttons\":[]}')" >/dev/null || fail "BLOCO B: INSERT com interactive jsonb deveria ter sucedido"

# Aditiva: colunas antigas da base continuam.
for col in id name description category content media_url media_type tags status use_count created_by created_at updated_at; do
  psql_test -Atqc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='$col'" | grep -q '^1$' || fail "BLOCO B: coluna antiga $col foi removida (nao e aditiva)"
done
printf '[PASS] BLOCO B — migration alvo aplica 8 colunas com defaults, checks e leitura igual\n'

# BLOCO C — papel real: mesma leitura como authenticated, em transacao.
jwt_sub='11111111-1111-1111-1111-111111111111'
psql_test -Atqc "INSERT INTO public.talkx_templates (name, content) VALUES ('seed-a', 'conteudo-a'), ('seed-b', 'conteudo-b')" >/dev/null || fail "BLOCO C: seed deveria ter sucedido"
before="$(psql_test -Atqc "SELECT name || '|' || content || '|' || channel FROM public.talkx_templates WHERE name IN ('seed-a','seed-b') ORDER BY name")"
[[ "$before" == *"seed-a|conteudo-a|whatsapp"* ]] || fail "BLOCO C: seed-a inesperado: $before"
[[ "$before" == *"seed-b|conteudo-b|whatsapp"* ]] || fail "BLOCO C: seed-b inesperado: $before"
as_auth="$(psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL \"request.jwt.claim.sub\" = '${jwt_sub}'; SELECT name || '|' || content || '|' || channel FROM public.talkx_templates WHERE name IN ('seed-a','seed-b') ORDER BY name; COMMIT;")"
[[ "$as_auth" == "$before" ]] || fail "BLOCO C: leitura como authenticated difere: [$as_auth] vs [$before]"
printf '[PASS] BLOCO C — authenticated le as mesmas linhas e valores (transacao com SET LOCAL)\n'

printf '[PASS] talkx_templates columns migration applied and verified\n'
