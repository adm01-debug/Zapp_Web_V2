#!/usr/bin/env bash
# SEC-DEFINER_GRANTS_STORAGE-06/08 (docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md).
#
# Prova, em PostgreSQL descartavel, a migration
# 20261011010002_bucket_limits_e_team_chat_files_identidade.sql:
#
#   RED   — antes da migration: `stickers`/`audio-memes` nascem SEM file_size_limit e SEM
#           allowed_mime_types (bucket publico aceita texto arbitrario), e em `team-chat-files`
#           a policy de SELECT/DELETE compara a pasta com auth.uid() (id de USUARIO) enquanto a
#           de INSERT grava a pasta com current_profile_id() (id de PROFILE) — o dono do envio
#           NAO lista nem apaga o proprio arquivo;
#   GREEN — a migration aplica com ON_ERROR_STOP=1 e:
#             * os dois buckets recebem 512000 bytes + lista de MIME (o `text/html` do cenario da
#               auditoria fica fora);
#             * o dono (mesmo usuario do profile dono da pasta) passa a listar e a apagar o proprio
#               arquivo — a identidade fica igual nos tres verbos;
#             * o ramo de membro da conversa (p.user_id = auth.uid()) continua valendo: o membro
#               ve o anexo da conversa mas NAO ve o arquivo pessoal de outro e NAO apaga nada;
#             * o ramo de admin (is_admin_or_supervisor(auth.uid())) continua vendo tudo;
#             * anon nao le.
#
# O pre-estado do Supabase (schema auth, papeis, storage) e recriado a mao, como nos harnesses
# irmaos, porque a regra testada e justamente a que a migration aperta.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
migration_file="20261011010002_bucket_limits_e_team_chat_files_identidade.sql"
postgres_image="${BUCKETS_CHAT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="buckets-team-chat-$$"
test_password="buckets_chat_test_only"

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

-- storage.foldername: mesma semantica do Storage (todos os segmentos menos o nome do arquivo).
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);
-- Em producao `authenticated` LE `profiles` (a policy de team-chat-files faz
-- `p.id = mem.profile_id ... p.user_id = auth.uid()`), mas NAO le `user_roles` — dai o
-- `is_admin_or_supervisor` SECURITY DEFINER logo abaixo.
GRANT SELECT ON public.profiles TO authenticated;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;

-- Helper identico ao da migration 20260928420000: profile do usuario logado, por auth.uid().
CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated;

-- Buckets do Storage (Supabase): a migration atualiza file_size_limit/allowed_mime_types.
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO service_role;
-- O Supabase concede SELECT em storage.objects a anon (buckets publicos servem sem JWT).
GRANT SELECT ON storage.objects TO anon;

-- Conversa de time: o anexo vive em team_messages.media_path dentro de team-chat-files.
CREATE TABLE public.team_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.team_conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  PRIMARY KEY (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id),
  media_bucket text,
  media_path text
);
GRANT SELECT ON public.team_messages, public.team_conversation_members, public.team_conversations TO authenticated;
GRANT SELECT ON public.team_messages, public.team_conversation_members, public.team_conversations, public.profiles TO anon;
-- anon tambem precisa de SELECT nas tabelas da conversa: no PRE-estado a policy de
-- team-chat-files nao tem TO (vale para anon) e avaliar o ramo de membro exige ler
-- essas tabelas. Apos a migration a policy passa a TO authenticated e anon nem a avalia.

-- ── pre-estado REAL (antes da migration) ──────────────────────────────────────
-- Buckets publicos nasceram sem limite de tamanho nem lista de MIME (auditoria -06).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('stickers', 'stickers', true),
  ('audio-memes', 'audio-memes', true);
-- Leitura publica do bucket `stickers` (bucket publico: anon le sem JWT).
CREATE POLICY "Public read stickers" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'stickers');

-- Policies REAIS de team-chat-files antes desta migration:
--   SELECT 20260927270012 (E21) e DELETE 20260511233306 — ambas comparam a pasta com auth.uid().
CREATE POLICY "Conversation members can read team chat files" ON storage.objects FOR SELECT
  USING (bucket_id = 'team-chat-files' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR is_admin_or_supervisor(auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_messages tm
                 JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id
                 JOIN public.profiles p ON p.id = mem.profile_id
                WHERE tm.media_bucket = 'team-chat-files' AND tm.media_path = name AND p.user_id = auth.uid())));
CREATE POLICY "Users can delete own team chat files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Atores: A = agente dono (profile PA / user UA), B = agente membro da conversa (PB / UB),
-- D = admin (PD / UD). profiles.id <> profiles.user_id de proposito (e o cerne do achado -08).
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-00000000000d');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'agent'),
  ('20000000-0000-0000-0000-00000000000b', 'agent'),
  ('20000000-0000-0000-0000-00000000000d', 'admin');

-- Conversa 1: membros A e B. Anexo da conversa aponta para o arquivo de A.
INSERT INTO public.team_conversations (id) VALUES ('30000000-0000-0000-0000-000000000001');
INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b');
INSERT INTO public.team_messages (conversation_id, media_bucket, media_path) VALUES
  ('30000000-0000-0000-0000-000000000001', 'team-chat-files', '10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin');

-- Objetos no bucket (a pasta e o id do PROFILE de quem enviou, como grava o INSERT real).
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('team-chat-files', '10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf'),
  ('team-chat-files', '10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin'),
  ('stickers', 'compartilhado.png');
SQL

user_a="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000a';"
user_b="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000b';"
user_d="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000d';"
anon_session="SET ROLE anon; SET request.jwt.claim.role='anon';"

# ── RED: antes da migration ───────────────────────────────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.buckets WHERE id IN ('stickers','audio-memes') AND file_size_limit IS NULL AND allowed_mime_types IS NULL")" == '2' ]] \
  || fail 'RED: stickers/audio-memes ja tinham limite/MIME antes da migration (a prova perdeu o sentido)'

[[ "$(psql_test -Atqc "$user_a SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';")" == '0' ]] \
  || fail 'RED: o dono ja listava o proprio arquivo (a policy de SELECT nao estava com auth.uid())'
psql_test -Atqc "$user_a DELETE FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';" >/dev/null
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';")" == '1' ]] \
  || fail 'RED: o dono ja apagava o proprio arquivo (a policy de DELETE nao estava com auth.uid())'

# Baseline de leitura publica: anon le o objeto do bucket publico `stickers` antes da migration.
[[ "$(psql_test -Atqc "$anon_session SELECT count(*) FROM storage.objects WHERE bucket_id='stickers';")" == '1' ]] \
  || fail 'RED: anon nao lia o objeto publico de stickers antes da migration (baseline de leitura publica quebrado)'

# Baseline do ramo de membro (tem de continuar valendo depois).
[[ "$(psql_test -Atqc "$user_b SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin';")" == '1' ]] \
  || fail 'RED: membro da conversa nao via o anexo nem antes da migration (ramo de membro quebrado no pre-estado)'

# ── GREEN: aplica a migration de verdade (ON_ERROR_STOP=1) ─────────────────────
[[ -f "$migrations_dir/$migration_file" ]] || fail "migration ausente: $migration_file"
printf '  · aplicando %s\n' "$migration_file" >&2
psql_test < "$migrations_dir/$migration_file" >/dev/null

# ── GREEN 1: limites e MIME dos dois buckets ──────────────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.buckets WHERE id IN ('stickers','audio-memes') AND file_size_limit = 512000")" == '2' ]] \
  || fail 'os dois buckets nao receberam file_size_limit = 512000'
[[ "$(psql_test -Atqc "SELECT allowed_mime_types::text FROM storage.buckets WHERE id='stickers';")" == '{image/png,image/webp,image/gif,image/jpeg}' ]] \
  || fail "MIME de stickers divergente: $(psql_test -Atqc "SELECT allowed_mime_types::text FROM storage.buckets WHERE id='stickers';")"
[[ "$(psql_test -Atqc "SELECT allowed_mime_types::text FROM storage.buckets WHERE id='audio-memes';")" == '{audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/aac}' ]] \
  || fail "MIME de audio-memes divergente: $(psql_test -Atqc "SELECT allowed_mime_types::text FROM storage.buckets WHERE id='audio-memes';")"

# O tipo do cenario da auditoria (pagina hospedada) fica FORA dos dois buckets.
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.buckets WHERE id IN ('stickers','audio-memes') AND 'text/html' = ANY(allowed_mime_types)")" == '0' ]] \
  || fail 'text/html continua aceito em stickers/audio-memes (cenario da auditoria -06)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.buckets WHERE id='stickers' AND 'image/png' = ANY(allowed_mime_types)")" == '1' ]] \
  || fail 'image/png deixou de ser aceito no bucket stickers'

# ── GREEN 2: identidade igual nos tres verbos — o dono volta a listar/apagar ──
[[ "$(psql_test -Atqc "$user_a SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';")" == '1' ]] \
  || fail 'o dono ainda NAO lista o proprio arquivo apos a migration'
[[ "$(psql_test -Atqc "$user_a SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';")" == '2' ]] \
  || fail "o dono deveria ver os 2 objetos (proprio + anexo da conversa): $(psql_test -Atqc "$user_a SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';")"

# ── GREEN 3: o ramo de membro continua valendo, mas nao vira "ve tudo" ────────
[[ "$(psql_test -Atqc "$user_b SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin';")" == '1' ]] \
  || fail 'membro da conversa deixou de ver o anexo (ramo p.user_id = auth.uid() quebrou)'
[[ "$(psql_test -Atqc "$user_b SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';")" == '0' ]] \
  || fail 'membro da conversa passou a ver o arquivo pessoal de outro profile'
[[ "$(psql_test -Atqc "$user_b SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';")" == '1' ]] \
  || fail "membro deveria ver so o anexo da conversa: $(psql_test -Atqc "$user_b SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';")"

# ── GREEN 4: admin continua vendo tudo; anon nada ────────────────────────────
[[ "$(psql_test -Atqc "$user_d SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';")" == '2' ]] \
  || fail "admin deveria ver os 2 objetos: $(psql_test -Atqc "$user_d SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';")"
# anon NAO enxerga team-chat-files: a policy de SELECT e TO authenticated, entao nem chega a
# avaliar current_profile_id() (que anon nao pode executar). Qualquer erro (ex. permission
# denied de funcao) reprova — prova do TO authenticated.
anon_read="$(psql_test -Atqc "$anon_session SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files';" 2>&1 || true)"
[[ "$anon_read" == '0' ]] || fail "anon em team-chat-files deveria ver 0 linhas sem erro (TO authenticated): $anon_read"

# anon CONTINUA lendo o bucket publico `stickers` apos a migration: se a policy de
# team-chat-files valesse para anon, a consulta tombaria com erro de permissao de funcao
# (current_profile_id() e so de authenticated) — erro aqui reprova.
anon_stickers="$(psql_test -Atqc "$anon_session SELECT count(*) FROM storage.objects WHERE bucket_id='stickers';" 2>&1 || true)"
[[ "$anon_stickers" == '1' ]] || fail "anon deixou de ler o objeto publico de stickers apos a migration: $anon_stickers"

# ── GREEN 5: DELETE e so do dono ─────────────────────────────────────────────
# Membro nao apaga o anexo da conversa (DELETE so tem o ramo de dono).
psql_test -Atqc "$user_b DELETE FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin';" >/dev/null
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin';")" == '1' ]] \
  || fail 'membro da conversa apagou o anexo (DELETE virou amplo demais)'

# O dono apaga o proprio arquivo; o anexo da conversa permanece.
psql_test -Atqc "$user_a DELETE FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';" >/dev/null
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/relatorio-do-dono.pdf';")" == '0' ]] \
  || fail 'o dono NAO apagou o proprio arquivo apos a migration'
[[ "$(psql_test -Atqc "SELECT count(*) FROM storage.objects WHERE name='10000000-0000-0000-0000-00000000000a/anexo-da-conversa.bin';")" == '1' ]] \
  || fail 'o anexo da conversa foi apagado junto (DELETE passou do escopo do dono)'

printf '[OK] SEC-DEFINER_GRANTS_STORAGE-06/08: stickers/audio-memes com 512000 bytes e lista de\n' >&2
printf '     MIME (text/html fora); e em team-chat-files a identidade fica igual nos tres verbos\n' >&2
printf '     (dono lista/apaga o proprio arquivo; membro da conversa e admin preservados; anon fora).\n' >&2
