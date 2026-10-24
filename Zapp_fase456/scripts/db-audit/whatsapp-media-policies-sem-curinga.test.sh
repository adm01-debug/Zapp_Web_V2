#!/usr/bin/env bash
# SEC-DEFINER_GRANTS_STORAGE-02 (docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md).
#
# Prova, em PostgreSQL 17 descartavel, que as policies de SELECT de midia do WhatsApp
# nao deixam o NOME DO OBJETO virar padrao:
#
#   RED   — com as policies antigas (20260930700000, `m.media_url LIKE '%/' || objects.name`),
#           um agente atribuido ao contato dono de `image/foto-2026.jpg` LE `image/foto_2026.jpg`
#           e `image/foto%2026.jpg` (o `_`/`%` casou o `-`): arquivos SEM vinculo com nenhuma
#           mensagem dele.
#   GREEN — aplicada a migration 20261011003024 (comparacao EXATA `right(...)`/`position(...)`,
#           mesmo JOIN contacts de atribuicao), a leitura do objeto alheio cai para 0 e a leitura
#           legitima (`image/foto-2026.jpg`, o arquivo da mensagem do proprio contato) segue = 1;
#           admin segue enxergando tudo e agente nao atribuido segue barrado.
#
# Aplica as MIGRATIONS REAIS de supabase/migrations e roda como o PAPEL REAL
# (authenticated/anon), nunca como postgres. Prova de comportamento, nao de texto do deparse.
#
# REGISTRO PENDENTE: passo em .github/workflows/db-guard.yml (dono do workflow) — o teste sobe
# container proprio (docker run -d), incompativel com o docker-shim do E47, como os testes do
# bloco E50/F64.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
old_migration="$migrations_dir/20260930700000_fix_whatsapp_storage_policies.sql"
fix_migration_name="20261011003024_whatsapp_media_policies_sem_curinga_like.sql"
fix_migration="$migrations_dir/$fix_migration_name"
postgres_image="${WHATSAPP_MEDIA_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="whatsapp-media-policies-$$"
test_password="whatsapp_media_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$old_migration" ]] || fail "migration ausente: $old_migration"
[[ -f "$fix_migration" ]] || fail "migration ausente: $fix_migration_name"

docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
ready=0
for _ in $(seq 1 90); do
  if psql_test 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

# ── infraestrutura que o Supabase fornece (auth, storage, papeis, extension) ─────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA extensions;
CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE SCHEMA storage;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- storage.foldername: tudo menos o nome do arquivo (mesmo contrato do Storage).
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  media_url text
);

-- Storage real do Supabase (tabelas sniffadas pela RLS).
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.objects TO anon, authenticated;

-- `authenticated` LE messages (a policy antiga e a de 20261003142707 resolvem o acesso pelo
-- locator da mensagem): sem o GRANT o EXISTS cairia em permission denied, nao em RLS.
GRANT SELECT ON public.messages TO authenticated;
-- Default privileges do Supabase: tabela nova no public nasce aberta.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
-- As tabelas acima foram criadas ANTES do ALTER DEFAULT PRIVILEGES, entao o GRANT explicito e
-- necessario: sem SELECT em public.contacts o EXISTS da policy cairia em permission denied.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- Atores: A1 = agente do contato C1; A2 = agente do contato C2; ADM = admin.
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-00000000000d');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'agent'),
  ('20000000-0000-0000-0000-00000000000b', 'agent'),
  ('20000000-0000-0000-0000-00000000000d', 'admin');

INSERT INTO public.contacts (id, assigned_to) VALUES
  ('30000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000b');

-- A mensagem do contato de A1 aponta para `image/foto-2026.jpg` (hifen). NENHUMA mensagem aponta
-- para `image/foto_2026.jpg` (underscore) nem `image/foto%2026.jpg` (percent) — sao objetos
-- alheios. `_`/`%` no nome deles NAO podem casar o `-` da mensagem do A1.
INSERT INTO public.messages (contact_id, media_url) VALUES
  ('30000000-0000-0000-0000-00000000000c', 'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/image/foto-2026.jpg'),
  ('30000000-0000-0000-0000-000000000002', 'https://proj.supabase.co/storage/v1/object/public/whatsapp-media/image/outro.jpg');

-- Objetos no bucket. `foto-2026.jpg` = arquivo da mensagem do contato de A1 (legitimo);
-- `foto_2026.jpg` / `foto%2026.jpg` = alheios (so casam pelo curinga).
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('whatsapp-media', 'image/foto-2026.jpg'),
  ('whatsapp-media', 'image/foto_2026.jpg'),
  ('whatsapp-media', 'image/foto%2026.jpg'),
  ('whatsapp-media', 'image/sem-vinculo.jpg'),
  ('audio-messages', 'audio/recado_2026.ogg'),
  ('audio-messages', 'audio/recado-2026.ogg');
SQL

agent_a1="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000a';"
agent_a2="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000b';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000d';"
anon_session="SET ROLE anon; SET request.jwt.claim.role='anon';"

read_obj() { psql_test -c "$1 SELECT count(*) FROM storage.objects WHERE name = '$2';" 2>/dev/null || printf 'ERR'; }

# ── RED: as policies antigas deixam o nome virar padrao ──────────────────────────
psql_test < "$old_migration" >/dev/null
[[ "$(read_obj "$agent_a1" 'image/foto-2026.jpg')" == '1' ]] \
  || fail "RED: A1 nao leu o proprio arquivo (image/foto-2026.jpg) — setup errado"
[[ "$(read_obj "$agent_a1" 'image/foto_2026.jpg')" == '1' ]] \
  || fail "RED: o curinga '_' NAO vazou image/foto_2026.jpg (a policy antiga ja barrava? prova invalida)"
[[ "$(read_obj "$agent_a1" 'image/foto%2026.jpg')" == '1' ]] \
  || fail "RED: o curinga '%' NAO vazou image/foto%2026.jpg (a policy antiga ja barrava? prova invalida)"
[[ "$(read_obj "$agent_a2" 'image/foto_2026.jpg')" == '0' ]] \
  || fail 'RED: agente NAO atribuido leu objeto alheio (a checagem de atribuicao ja falhava)'
printf '[PASS] RED: com LIKE, A1 leu os objetos alheios foto_2026.jpg e foto%%2026.jpg\n' >&2

# ── GREEN: aplica a migration da correcao ────────────────────────────────────────
psql_test < "$fix_migration" >/dev/null

[[ "$(read_obj "$agent_a1" 'image/foto-2026.jpg')" == '1' ]] \
  || fail 'GREEN: A1 perdeu a leitura LEGITIMA do proprio arquivo (image/foto-2026.jpg)'
[[ "$(read_obj "$agent_a1" 'image/foto_2026.jpg')" == '0' ]] \
  || fail "GREEN: curinga '_' ainda vaza image/foto_2026.jpg"
[[ "$(read_obj "$agent_a1" 'image/foto%2026.jpg')" == '0' ]] \
  || fail "GREEN: curinga '%' ainda vaza image/foto%2026.jpg"
[[ "$(read_obj "$agent_a1" 'image/sem-vinculo.jpg')" == '0' ]] \
  || fail 'GREEN: A1 leu objeto sem vinculo nenhum (image/sem-vinculo.jpg)'
[[ "$(read_obj "$agent_a1" 'audio/recado_2026.ogg')" == '0' ]] \
  || fail "GREEN: curinga '_' ainda vaza o audio alheio audio/recado_2026.ogg"
[[ "$(read_obj "$agent_a2" 'image/foto-2026.jpg')" == '0' ]] \
  || fail 'GREEN: agente NAO atribuido leu o arquivo do contato do A1'
[[ "$(read_obj "$admin_session" 'image/foto_2026.jpg')" == '1' ]] \
  || fail 'GREEN: admin deveria seguir enxergando tudo'
[[ "$(read_obj "$anon_session" 'image/foto-2026.jpg')" == '0' ]] \
  || fail 'GREEN: anon leu midia'

printf '[OK] SEC-DEFINER_GRANTS_STORAGE-02: com a migration %s o nome do objeto\n' "$fix_migration_name" >&2
printf '     deixou de virar padrao (%% e _ nao casam outro locator); leitura legitima, admin\n' >&2
printf '     e barreira de anon/atribuicao seguem de pe.\n' >&2
