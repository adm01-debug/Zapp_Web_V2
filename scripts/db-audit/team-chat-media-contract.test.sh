#!/usr/bin/env bash
# TC-001 (#54) — "Fluxo de mídia usa três contratos incompatíveis entre storage, mensagem e
# renderização" (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).
#
# Só a parte de BANCO do achado, em PostgreSQL descartável, com as MIGRATIONS REAIS do bucket
# `team-chat-files` e da tabela `team_messages` aplicadas na ordem de versão (nada de policy
# copiada para dentro do teste) e executando como o PAPEL REAL (`authenticated`, `anon`).
#
# Contrato canônico do uploader (`src/hooks/team-chat/uploadTeamMedia.ts`, R2-DB-020):
#   path `<profile_id>/<conversation_id>/<uuid>.<ext>` no bucket privado + locator persistido
#   (`media_bucket` + `media_path` + `media_type`) SEM `media_url`.
#
#   RED   — estado anterior (só as migrations reais), tudo medido como `authenticated`:
#             (a) P1 (profiles.id <> auth.uid) NÃO lê o próprio anexo quando ele não é citado
#                 por uma mensagem (o ramo de pasta compara com auth.uid) e NÃO exclui o
#                 próprio anexo (0 linhas);
#             (b) a mensagem canônica (locator + media_type, sem media_url) é RECUSADA por
#                 team_messages_media_consistency — o INSERT do áudio/arquivo/colagem falha;
#             (c) BUURACO: com uma mensagem do próprio P3 cujo media_path é igual ao nome do
#                 seu perfil, o ramo EXISTS da policy de SELECT (`tm.media_path = name`, coluna
#                 sem qualificar → resolve para profiles.name) passa para QUALQUER objeto do
#                 bucket: P3 lê o anexo de P1, de quem não é membro.
#   GREEN — com a migration 20261007010651 aplicada (ON_ERROR_STOP=1):
#             (a) P1 lê e exclui o próprio anexo; P2 (mesma conversa) continua lendo o anexo
#                 de P1 pelo locator; P3 (estranho) não lê nem exclui;
#             (b) a mensagem canônica entra (content vazio + locator + media_type) e volta;
#             (c) o buraco fecha: com a mesma mensagem-armadilha, P3 lê ZERO objetos;
#             (d) nada afrouxou: mensagem vazia segue recusada, locator sem media_type
#                 segue recusado, media_type sem referência segue recusado, upload para a pasta
#                 de OUTRO perfil segue recusado, o objeto legado na pasta `auth.uid` continua
#                 legível/excluível pelo dono e o UPDATE de storage.objects por `authenticated`
#                 continua revogado; `anon` não lê.
#
# O pré-estado do Supabase (schema auth/storage, papéis e grants) é recriado à mão, como nos
# harnesses irmãos, porque é infraestrutura da plataforma — o que a migration muda (policies e
# CHECKs) vem dos ARQUIVOS REAIS de supabase/migrations/.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
migration_file="20261007010651_team_chat_media_contract_locators.sql"
postgres_image="${TEAM_CHAT_MEDIA_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-team-chat-media-$$"

# Migrations REAIS que montam o estado anterior, na ordem de versão.
real_migrations=(
  "20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql"        # policies de storage (delete próprio + admin)
  "20260905030000_private_media_buckets.sql"                       # bucket team-chat-files privado
  "20260927270012_team_chat_e21_storage_select_policy.sql"          # policy de SELECT (o defeito (c))
  "20260928420000_team_chat_current_profile_id_helper.sql"          # current_profile_id()
  "20260928560000_team_chat_e20_storage_team_chat_files.sql"        # policy de INSERT + REVOKE UPDATE
  "20260928600000_team_chat_e25_team_messages_integrity.sql"        # CHECKs da mensagem (o defeito (b))
  "20260929160000_team_chat_e26_message_type_media_constraint.sql"  # CHECK de message_type
)

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-chat-media-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
psql_sql()  { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

# Executa como o PAPEL REAL, com o JWT do usuário (auth.uid()).
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_anon() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $sql"
}
expect_value_as() {
  local label="$1" expected="$2" jwt="$3" sql="$4" got
  got="$(as_user "$jwt" "$sql" | tail -n1)"
  [[ "$got" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$got'"
  pass "$label"
}
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" out st
  set +e; out="$(as_user "$jwt" "$sql" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle' na mensagem"; }
  pass "$label"
}
expect_ok_as() {
  local label="$1" jwt="$2" sql="$3" out
  out="$(as_user "$jwt" "$sql" 2>&1)" || { printf '%s\n' "$out" >&2; fail "$label: deveria ter sucesso"; }
  pass "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker não está instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon não está acessível'
[[ -f "$migrations_dir/$migration_file" ]] || fail "migration ausente: $migration_file"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartável não ficou pronto de forma estável'

# ── infraestrutura da plataforma (auth, papéis, storage) ─────────────────────────────────────
psql_sql "
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS \$\$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid \$\$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
  AS \$\$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] \$\$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text,
  owner uuid,
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
" >/dev/null

# Tabelas de domínio que as policies reais tocam. `profiles.name` existe de verdade e é o que
# faz o defeito (c) aparecer; `team_messages` fica SEM RLS de propósito: aqui o objeto sob teste
# é o CHECK constraint (a visibilidade da mensagem por conversa tem contrato próprio).
psql_sql "
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text,
  role text DEFAULT 'agent'
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY,
  type text NOT NULL DEFAULT 'direct'
);
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id),
  content text,
  message_type text DEFAULT 'text',
  media_url text,
  media_type text,
  media_bucket text,
  media_path text,
  is_edited boolean,
  reply_to_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- is_admin_or_supervisor: corpo canônico (20251215025014), recriado como infraestrutura.
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')) \$\$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

GRANT SELECT ON public.profiles, public.team_conversation_members, public.team_conversations, public.contacts
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_messages TO authenticated, service_role;
" >/dev/null

# ── estado ANTERIOR: as migrations REAIS, na ordem ────────────────────────────────────────────
for m in "${real_migrations[@]}"; do
  [[ -f "$migrations_dir/$m" ]] || fail "migration real ausente: $m"
  printf '  · aplicando %s\n' "$m" >&2
  psql_file "$migrations_dir/$m" >/dev/null
done

# ── dados sintéticos ──────────────────────────────────────────────────────────────────────────
# P1 (Ana, auth user A1), P2 (Bruno, B2) na conversa C1; P3 (Carla, C3) na conversa C2.
# Nos três, profiles.id <> auth.uid — é o caso que o defeito (a) quebra.
psql_sql "
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bruno'),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000003', 'Carla');
INSERT INTO public.team_conversations (id) VALUES
  ('c1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222');
INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('c1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('c2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
-- objetos do bucket privado
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('team-chat-files', '11111111-1111-1111-1111-111111111111/c1111111-1111-1111-1111-111111111111/a.webm'),
  ('team-chat-files', '11111111-1111-1111-1111-111111111111/c1111111-1111-1111-1111-111111111111/b.webm'),
  ('team-chat-files', 'aaaaaaaa-0000-0000-0000-000000000001/c1111111-1111-1111-1111-111111111111/legado.webm');
-- mensagem do P1 citando a.webm (com media_url: é o formato que o CHECK antigo aceita)
INSERT INTO public.team_messages (conversation_id, sender_id, content, media_url, media_type, media_bucket, media_path) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '🎤 Mensagem de áudio',
   'https://exemplo.invalid/storage/v1/object/public/team-chat-files/11111111-1111-1111-1111-111111111111/c1111111-1111-1111-1111-111111111111/a.webm',
   'audio', 'team-chat-files', '11111111-1111-1111-1111-111111111111/c1111111-1111-1111-1111-111111111111/a.webm');
-- mensagem-armadilha do P3: media_path igual ao NOME DO PRÓPRIO PERFIL (o defeito (c))
INSERT INTO public.team_messages (conversation_id, sender_id, content, media_url, media_type, media_bucket, media_path) VALUES
  ('c2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '🎨 Figurinha',
   'https://exemplo.invalid/storage/v1/object/public/team-chat-files/armadilha.png',
   'image', 'team-chat-files', 'Carla');
" >/dev/null

JWT_P1='{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}'
JWT_P2='{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}'
JWT_P3='{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}'

A_PATH='11111111-1111-1111-1111-111111111111/c1111111-1111-1111-1111-111111111111/a.webm'
B_PATH='11111111-1111-1111-1111-111111111111/c1111111-1111-1111-1111-111111111111/b.webm'
LEGADO_PATH='aaaaaaaa-0000-0000-0000-000000000001/c1111111-1111-1111-1111-111111111111/legado.webm'
CONV1='c1111111-1111-1111-1111-111111111111'

printf '\n== RED: estado anterior (migrations reais, sem a correção) ==\n'
expect_value_as 'RED: P1 não lê o próprio anexo sem mensagem que o cite (pasta é profiles.id, policy olha auth.uid)' \
  '0' "$JWT_P1" "SELECT count(*) FROM storage.objects WHERE name = '$B_PATH'"
expect_value_as 'RED: P1 não exclui o próprio anexo (0 linhas)' \
  '0' "$JWT_P1" "WITH d AS (DELETE FROM storage.objects WHERE name = '$B_PATH' RETURNING 1) SELECT count(*) FROM d"
expect_error_as 'RED: mensagem canônica (locator + media_type, sem media_url) é recusada' \
  'team_messages_media_consistency' "$JWT_P1" \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('$CONV1', '11111111-1111-1111-1111-111111111111', 'audio.webm', 'audio', 'team-chat-files', '$A_PATH')"
expect_value_as 'RED: P3 (de fora) lê o anexo de P1 — buraco de correlação aberto' \
  '1' "$JWT_P3" "SELECT count(*) FROM storage.objects WHERE name = '$A_PATH'"
expect_value_as 'RED: P3 (de fora) lê o objeto legado de outro usuário — buraco de correlação aberto' \
  '1' "$JWT_P3" "SELECT count(*) FROM storage.objects WHERE name = '$LEGADO_PATH'"

printf '\n== GREEN: aplicando %s ==\n' "$migration_file"
psql_file "$migrations_dir/$migration_file" >/dev/null

printf '\n== GREEN: contrato de mídia ==\n'
expect_value_as 'P1 lê o próprio anexo pela pasta profile_id' \
  '1' "$JWT_P1" "SELECT count(*) FROM storage.objects WHERE name = '$B_PATH'"
expect_value_as 'P1 exclui o próprio anexo (1 linha)' \
  '1' "$JWT_P1" "WITH d AS (DELETE FROM storage.objects WHERE name = '$B_PATH' RETURNING 1) SELECT count(*) FROM d"
[[ "$(psql_sql "SELECT count(*) FROM storage.objects WHERE name = '$B_PATH'")" == '0' ]] \
  || fail 'o anexo excluído continua no bucket'
pass 'o anexo excluído sumiu do bucket'
expect_value_as 'P1 lê o objeto legado gravado na pasta auth.uid (acesso antigo preservado)' \
  '1' "$JWT_P1" "SELECT count(*) FROM storage.objects WHERE name = '$LEGADO_PATH'"
expect_ok_as 'P1 inseriu a mensagem canônica (content vazio + locator + media_type, sem media_url)' \
  "$JWT_P1" \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('$CONV1', '11111111-1111-1111-1111-111111111111', '', 'audio', 'team-chat-files', '$B_PATH')"
expect_error_as 'locator sem media_type é recusado mesmo com bucket/path e content vazio' \
  'violates check constraint' "$JWT_P1" \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('$CONV1', '11111111-1111-1111-1111-111111111111', '', 'team-chat-files', '$B_PATH')"
expect_error_as 'locator sem media_type é recusado mesmo quando content não está vazio' \
  'team_messages_media_consistency' "$JWT_P1" \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('$CONV1', '11111111-1111-1111-1111-111111111111', 'texto com anexo incompleto', 'team-chat-files', '$B_PATH')"
expect_value_as 'a mensagem canônica volta na leitura de P1' \
  '1' "$JWT_P1" "SELECT count(*) FROM public.team_messages WHERE media_path = '$B_PATH'"
expect_value_as 'P2 (mesma conversa) continua lendo o anexo de P1 pelo locator' \
  '1' "$JWT_P2" "SELECT count(*) FROM storage.objects WHERE name = '$A_PATH'"
expect_value_as 'P1 lê o próprio anexo citado por mensagem' \
  '1' "$JWT_P1" "SELECT count(*) FROM storage.objects WHERE name = '$A_PATH'"
expect_value_as 'P3 (de fora) NÃO lê o anexo de P1' \
  '0' "$JWT_P3" "SELECT count(*) FROM storage.objects WHERE name = '$A_PATH'"
expect_value_as 'P3 (de fora) NÃO lê o objeto legado de outro usuário' \
  '0' "$JWT_P3" "SELECT count(*) FROM storage.objects WHERE name = '$LEGADO_PATH'"
expect_value_as 'P3 (de fora) NÃO exclui o anexo de P1 (0 linhas)' \
  '0' "$JWT_P3" "WITH d AS (DELETE FROM storage.objects WHERE name = '$A_PATH' RETURNING 1) SELECT count(*) FROM d"
[[ "$(as_anon "SELECT count(*) FROM storage.objects WHERE name = '$A_PATH'" | tail -n1)" == '0' ]] \
  || fail 'anon leu objeto do bucket privado'
pass 'anon não lê objeto do bucket privado'

printf '\n== GREEN: nada afrouxou ==\n'
expect_error_as 'mensagem sem conteúdo e sem mídia segue recusada' \
  'team_messages_content_not_empty' "$JWT_P1" \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content) VALUES ('$CONV1', '11111111-1111-1111-1111-111111111111', '')"
expect_error_as 'media_type sem nenhuma referência de mídia segue recusado' \
  'team_messages_media_consistency' "$JWT_P1" \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type) VALUES ('$CONV1', '11111111-1111-1111-1111-111111111111', 'texto', 'image')"
expect_error_as 'upload para a pasta de OUTRO perfil segue recusado' \
  'row-level security' "$JWT_P1" \
  "INSERT INTO storage.objects (bucket_id, name) VALUES ('team-chat-files', '22222222-2222-2222-2222-222222222222/c1111111-1111-1111-1111-111111111111/x.webm')"
expect_error_as 'UPDATE de storage.objects por authenticated segue revogado' \
  'permission denied' "$JWT_P1" \
  "UPDATE storage.objects SET name = name WHERE bucket_id = 'team-chat-files'"

printf '\nOK: contrato de mídia do Team Chat conferido (RED antes, GREEN depois).\n'
