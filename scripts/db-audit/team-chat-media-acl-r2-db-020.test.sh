#!/usr/bin/env bash
# R2-DB-020 (P1) — persistência de team_messages.media_path vinculada ao remetente e à conversa.
#
# CONTEXTO DA RETOMADA (12/10): a metade de ACL do R2-DB-020 já entrou no HEAD por
# 20261007010651 (TC-001/#54) — a policy de SELECT de storage.objects para o bucket
# team-chat-files passou a derivar a autorização de storage.objects.name (qualificação
# explícita) e da identidade canônica current_profile_id, sem o vetor profiles.name.
# Por isso este teste APLICA A MIGRATION REAL DO HEAD no container descartável e só então
# mede o que ainda faltava: o vínculo de media_path a sender_id/conversation_id.
#
# Roteiro (mesmo container):
#   PRE   — infraestrutura Supabase + seed com uma linha legada fora da chave canônica.
#   HEAD  — aplica 20261007010651 (ACL já corrigida) e prova que o vazamento está fechado.
#   BLOCO A — RED do que falta: sem o CHECK, INSERT com media_path divergente é ACEITO.
#   sonda — ADD CONSTRAINT validado equivalente FALHA com a linha legada (prova o legado).
#   MIG   — aplica a migration do cartão (CHECK NOT VALID + reconciliação + VALIDATE).
#   BLOCO B — a escrita divergente é recusada; canônica aceita; legado reconciliado;
#             updated_at preservado; gatilho religado; ACL segue segura.
#   BLOCO C — executa o SQL da linha "-- Rollback:" e prova que DEVOLVE o dado (media_bucket
#             restaurado), derruba o CHECK e apaga a tabela de apoio.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012192938_team_chat_media_path_sender_conversation.sql"
head_migration="$repo_root/supabase/migrations/20261007010651_team_chat_media_contract_locators.sql"
postgres_image="${R2DB020_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-r2db020-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-r2db020-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: deveria falhar, mas passou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$head_migration" ]] || fail "migration do HEAD nao encontrada: $head_migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── infraestrutura Supabase (auth, papeis, storage) ──────────────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Definição viva do Supabase para storage.foldername.
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts,1)-1];
END $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  name text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_muted boolean DEFAULT false,
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  media_url text,
  media_type text,
  media_bucket text,
  media_path text,
  is_edited boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Gatilho BEFORE UPDATE vivo no esquema real: regrava updated_at em qualquer UPDATE de
-- team_messages. Reproduzido para provar que a reconciliação da migration NÃO reescreve a
-- data das mensagens antigas.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql
  SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER update_team_messages_updated_at
  BEFORE UPDATE ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers (mesmas assinaturas/corpos do esquema vigente).
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_conversation_members tcm
                JOIN public.profiles p ON p.id = tcm.profile_id
                WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id) $$;

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view conversation messages" ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view conversation members" ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT, INSERT ON storage.objects TO authenticated;
REVOKE UPDATE ON storage.objects FROM authenticated;

-- Policy de INSERT vigente: o 1º segmento do objeto deve ser o profile_id do uploader —
-- metade "escrita" do contrato canônico <profile_id>/<conversation_id>/<opaco>.
CREATE POLICY team_chat_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text);
SQL

# ── seed ─────────────────────────────────────────────────────────────────────────
OWNER_PATH='b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque1.png'
O2_PATH='d0000000-0000-0000-0000-000000000001/2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/opaque2.png'
LEGACY_TS='2026-01-02 03:04:05+00'
RB_TABLE='team_chat_media_acl_r2_db_020_rb'

cat > "$tmp_dir/seed.sql" <<SQL
DELETE FROM public.team_messages;
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM storage.objects;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Admin'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Bob Owner'),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Carol Member'),
  ('d0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Dave Outsider');

INSERT INTO public.user_roles (user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.team_conversations (id, type, name) VALUES
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'group', 'conversa-1'),
  ('2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'group', 'conversa-2');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000001'),
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000000-0000-0000-0000-000000000001'),
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-000000000001'),
  ('2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_messages (conversation_id, sender_id, content, message_type, media_type, media_bucket, media_path, updated_at) VALUES
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000000-0000-0000-0000-000000000001', 'file1', 'image', 'image', 'team-chat-files', '$OWNER_PATH', '$LEGACY_TS'),
  -- LINHA LEGADA: reivindica media_bucket='team-chat-files' com media_path fora da chave
  -- canônica (1º segmento é o auth.uid do remetente, formato <auth_uid>/<opaco> anterior a
  -- 20260928560000). Prova que a migration reconcilia dado preexistente.
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000000-0000-0000-0000-000000000001', 'legacy file', 'image', 'image', 'team-chat-files', '22222222-2222-2222-2222-222222222222/legacy.png', '$LEGACY_TS');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('team-chat-files', '$OWNER_PATH'),
  ('team-chat-files', '$O2_PATH'),
  ('team-chat-files', 'shortpath'),
  ('team-chat-files', '22222222-2222-2222-2222-222222222222/legacy.png');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

as_actor() { # $1 = user_id (auth.uid), $2 = SQL
  printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', false); %s" "$1" "$2"
}
ADMIN_UID='11111111-1111-1111-1111-111111111111'
OWNER_UID='22222222-2222-2222-2222-222222222222'
MEMBER_UID='33333333-3333-3333-3333-333333333333'
OUTSIDER_UID='44444444-4444-4444-4444-444444444444'

echo '── Aplicando a migration do HEAD (ACL ja corrigida por 20261007010651) ───────────'
psql_file "$head_migration"
printf '[PASS] migration do HEAD aplicada\n'

echo
echo '── BLOCO A: ACL do HEAD ja fechada; o que falta e o vinculo de media_path ─────────'

# A1: o vazamento via profiles.name NAO existe mais (guard de regressao da metade de ACL).
expect_value 'A1 membro NAO le objeto de conversa alheia (ACL do HEAD segura)' '0' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$O2_PATH';")"

# A2 (RED do que falta): sem o CHECK, INSERT com media_path divergente e ACEITO hoje.
expect_value 'A2 (defeito) insert com media_path divergente e ACEITO antes da migration' '1' \
  "WITH ins AS (INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','image','team-chat-files','c0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque.png') RETURNING 1) SELECT count(*) FROM ins;"

echo
echo '── Sonda: um ADD CONSTRAINT VALIDADO falharia neste estado (prova do legado) ──────'
expect_error 'L1 ADD CONSTRAINT validado equivalente falha com linha legada' \
  'check constraint "probe_r2db020_canonical" of relation "team_messages" is violated by some row' \
  "ALTER TABLE public.team_messages ADD CONSTRAINT probe_r2db020_canonical CHECK (media_bucket IS DISTINCT FROM 'team-chat-files' OR (media_path IS NOT NULL AND split_part(media_path, '/', 1) = sender_id::text AND split_part(media_path, '/', 2) = conversation_id::text AND split_part(media_path, '/', 3) <> ''));"
psql_sql "ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS probe_r2db020_canonical;" >/dev/null
printf '[PASS] sonda removida (probe_r2db020_canonical)\n'

echo
echo '── Aplicando a migration do cartao ───────────────────────────────────────────────'
psql_file "$migration"
printf '[PASS] migration aplicada mesmo com linha legada (CHECK NOT VALID nao bloqueia)\n'

echo
echo '── Transicao do legado: reconciliacao + convalidacao ─────────────────────────────'
expect_error 'L2 insert novo com caminho divergente recusado ja sob NOT VALID' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','image','team-chat-files','22222222-2222-2222-2222-222222222222/legacy.png');"
expect_value 'L3 linha legada reconciliada: locator anulado (bucket/path/type), conteudo intacto' '1' \
  "SELECT count(*) FROM public.team_messages WHERE content='legacy file' AND media_bucket IS NULL AND media_path IS NULL AND media_type IS NULL;"
expect_value 'L4 constraint termina convalidada (convalidated = true)' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conname='team_messages_media_path_matches_sender_conversation' AND contype='c' AND convalidated;"
expect_value 'L5 reconciliacao preserva updated_at (gatilho suspenso no UPDATE)' 't' \
  "SELECT updated_at = '$LEGACY_TS'::timestamptz FROM public.team_messages WHERE content='legacy file';"
expect_value 'L6 gatilho update_team_messages_updated_at volta LIGADO' '1' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.team_messages'::regclass AND tgname='update_team_messages_updated_at' AND tgenabled='O' AND NOT tgisinternal;"
expect_value 'L7 tabela de apoio guardou o valor antigo da linha reconciliada' '1' \
  "SELECT count(*) FROM public.$RB_TABLE WHERE media_bucket='team-chat-files' AND media_path='22222222-2222-2222-2222-222222222222/legacy.png';"
expect_value 'L8 tabela de apoio tem RLS ligada' '1' \
  "SELECT count(*) FROM pg_class WHERE oid='public.$RB_TABLE'::regclass AND relrowsecurity;"
expect_value 'L9 authenticated NAO tem SELECT na tabela de apoio' 'f' \
  "SELECT has_table_privilege('authenticated','public.$RB_TABLE','SELECT');"

echo
echo '── BLOCO B: o CHECK vincula media_path a sender_id/conversation_id ───────────────'
# Inserts/updates rodam como postgres (superuser) para isolar o CHECK da RLS: a constraint
# e de TABELA e vale para qualquer papel, inclusive superuser.
expect_error 'B1 insert apontando para PERFIL divergente e recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','image','team-chat-files','c0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque.png');"
expect_error 'B2 insert apontando para CONVERSA divergente e recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','image','team-chat-files','b0000000-0000-0000-0000-000000000001/2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/opaque.png');"
expect_error 'B3 insert com caminho curto e recusado (sem erro de cast)' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','image','team-chat-files','shortpath');"
expect_error 'B4 insert com nome opaco vazio e recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','image','team-chat-files','b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/');"
expect_value 'B5 insert com caminho canonico e aceito' '1' \
  "WITH ins AS (INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','ok','image','team-chat-files','b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque-ok.png') RETURNING 1) SELECT count(*) FROM ins;"
expect_error 'B6 update apontando para conversa divergente e recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "UPDATE public.team_messages SET media_path='b0000000-0000-0000-0000-000000000001/2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/opaque.png' WHERE media_path='b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque-ok.png';"
expect_value 'B7 media_bucket diferente/nulo nao e afetado' '1' \
  "WITH ins AS (INSERT INTO public.team_messages (conversation_id, sender_id, content, media_type, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','txt',NULL,NULL,NULL) RETURNING 1) SELECT count(*) FROM ins;"

echo
echo '── ACL segue segura apos a migration (guards de regressao) ───────────────────────'
expect_value 'B8 membro le objeto da propria conversa' '1' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"
expect_value 'B9 dono da pasta le o proprio arquivo' '1' \
  "$(as_actor "$OWNER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"
expect_value 'B10 admin le objeto de outra conversa' '1' \
  "$(as_actor "$ADMIN_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$O2_PATH';")"
expect_value 'B11 nao-membro NAO le objeto da conversa alheia' '0' \
  "$(as_actor "$OUTSIDER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"
expect_value 'B12 caminho curto/malformado nega (sem erro de cast)' '0' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='shortpath';")"

echo
echo '── Definicao efetiva: policy segura do HEAD + CHECK novo ─────────────────────────'
expect_value 'D1 policy do HEAD presente e TO authenticated' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Conversation members can read team chat files' AND roles = ARRAY['authenticated']::name[];"
expect_value 'D2 policy deriva de objects.name (qualificacao explicita)' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Conversation members can read team chat files' AND qual LIKE '%objects.name%';"
expect_value 'D3 CHECK de media_path presente' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conname='team_messages_media_path_matches_sender_conversation' AND contype='c';"

echo
echo '── BLOCO C: o Rollback do cabecalho e REAL — devolve o DADO e derruba o CHECK ────'
rollback_sql="$(awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--$/{exit} f&&/^--   /{sub(/^--   /,"");print}' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'migration sem SQL de rollback executavel'
printf '%s\n' "$rollback_sql" | docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null

expect_value 'C1 rollback remove o CHECK de media_path' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conname='team_messages_media_path_matches_sender_conversation' AND contype='c';"
expect_value 'C2 rollback apaga a tabela de apoio' '0' \
  "SELECT count(*) FROM pg_class WHERE relname='$RB_TABLE' AND relnamespace='public'::regnamespace;"
expect_value 'C3 rollback devolve o locator (bucket/path/type) das linhas reconciliadas' '1' \
  "SELECT count(*) FROM public.team_messages WHERE media_bucket='team-chat-files' AND media_path='22222222-2222-2222-2222-222222222222/legacy.png' AND media_type='image';"
expect_value 'C4 updated_at segue preservado depois do rollback' 't' \
  "SELECT updated_at = '$LEGACY_TS'::timestamptz FROM public.team_messages WHERE media_path='22222222-2222-2222-2222-222222222222/legacy.png';"
expect_value 'C5 gatilho segue LIGADO depois do rollback' '1' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.team_messages'::regclass AND tgname='update_team_messages_updated_at' AND tgenabled='O' AND NOT tgisinternal;"
expect_value 'C6 policy do HEAD intacta apos o rollback' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Conversation members can read team chat files' AND qual LIKE '%objects.name%';"

printf '\n[OK] contrato R2-DB-020 (persistencia de media_path do Team Chat) verificado\n'
