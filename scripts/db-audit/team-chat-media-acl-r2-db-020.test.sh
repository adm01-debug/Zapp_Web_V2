#!/usr/bin/env bash
# R2-DB-020 (P1). Contrato de autorização da mídia do Team Chat — a ACL de leitura
# de storage.objects (bucket team-chat-files) e a persistência de
# team_messages.media_path precisam derivar da LINHA EXTERNA do objeto
# (storage.objects.name, qualificação explícita) e do usuário autenticado — nunca de
# profiles.name.
#
# DEFEITO (pré-migration): a policy "Conversation members can read team chat files"
# (20260927270012) comparava `tm.media_path = name` sem qualificação. No subselect o
# `name` resolve para profiles.name (a tabela profiles está no JOIN). Um usuário cujo
# profiles.name fosse igual ao media_path de uma mensagem de conversa da qual participa
# liberava a leitura de QUALQUER objeto do bucket, inclusive de conversa alheia.
#
# Roda o MESMO roteiro no mesmo container:
#   BLOCO A — estado ANTERIOR (policy vulnerável): prova o vazamento.
#   BLOCO B — migration aplicada: prova a correção e preserva membro/dono/admin; e
#             prova o CHECK que vincula media_path a sender_id/conversation_id.
#   BLOCO E — contrato de ESCRITA: a policy de INSERT team_chat_files_insert
#             (20260928560000, já vigente antes desta migration) exige 1º segmento =
#             current_profile_id — alinhada ao formato canônico que o frontend grava
#             (TeamFileUploader.tsx / useTeamChatDraft.ts: <profile_id>/<conversation_id>/
#             <opaco>). Sem policy de UPDATE (UPDATE revogado em 20260928560000).
#   BLOCO C — ROLLBACK REAL: aplica o SQL da linha "-- Rollback:" da migration e
#             prova que ela recria uma leitura equivalente E segura (objects.name
#             qualificado), não a versão vulnerável, nem "bucket sem policy".
#
# Legado <auth_uid>/...: o bucket team-chat-files tinha 0 objetos e 0 linhas de
# team_messages com media_bucket='team-chat-files' em produção (contagem via gateway
# read-only em 2026-10-05) — o formato antigo foi ABANDONADO. O teste prova que um
# objeto em <auth_uid>/..., legível pelo dono sob a policy antiga, deixa de ser
# legível sob a nova (dono = current_profile_id, não auth.uid), e que o ADD
# CONSTRAINT simples é seguro por não haver linha que o viole.
#
# Pré-estado fiel: storage.objects + storage.foldername (definição viva do Supabase),
# profiles/team_conversations/team_conversation_members/team_messages, helpers
# is_admin_or_supervisor/current_profile_id/is_team_conversation_member, a policy
# vulnerável de 20260927270012 (SELECT) e a policy de INSERT de 20260928560000.
# A chave canônica é <profile_id>/<conversation_id>/<opaco>.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261004192405_team_chat_media_acl_r2_db_020.sql"
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
-- Definição viva do Supabase para storage.foldername (retorna os segmentos, exceto o último).
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

-- Helpers (mesmas assinaturas/corpos da produção).
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

-- RLS das tabelas de Team Chat (só o que a policy sob teste referencia).
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view conversation messages" ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view conversation members" ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

-- Grants do ator (authenticated lê as tabelas citadas pelas policies; profiles fica
-- legível porque a policy ANTERIOR referencia profiles.name no subselect).
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT, INSERT ON storage.objects TO authenticated;
-- Como em produção (20260928560000): UPDATE foi revogado de authenticated — não há
-- policy de UPDATE no bucket; quem grava só INSERTa (e DELETE fica fora do escopo).
REVOKE UPDATE ON storage.objects FROM authenticated;

-- POLICY DE INSERT VIGENTE (20260928560000), tal como em produção: o 1º segmento do
-- nome do objeto deve ser o profile_id do uploader — é a metade "escrita" do
-- contrato canônico <profile_id>/<conversation_id>/<opaco> que o frontend grava.
CREATE POLICY team_chat_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text);

-- POLICY VULNERÁVEL (20260927270012), tal como em produção.
CREATE POLICY "Conversation members can read team chat files" ON storage.objects FOR SELECT USING (
  bucket_id = 'team-chat-files' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.team_messages tm
      JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id
      JOIN public.profiles p ON p.id = mem.profile_id
      WHERE tm.media_bucket = 'team-chat-files' AND tm.media_path = name AND p.user_id = auth.uid()
    )
  )
);
SQL

# ── seed ─────────────────────────────────────────────────────────────────────────
OWNER_PATH='b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque1.png'
O2_PATH='d0000000-0000-0000-0000-000000000001/2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/opaque2.png'

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
  -- MEMBER: profiles.name é deliberadamente IGUAL ao media_path de M1 — é o que a
  -- policy vulnerável casa (tm.media_path = p.name), liberando objeto de conversa alheia.
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '$OWNER_PATH'),
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

INSERT INTO public.team_messages (conversation_id, sender_id, content, message_type, media_bucket, media_path) VALUES
  ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000000-0000-0000-0000-000000000001', 'file1', 'image', 'team-chat-files', '$OWNER_PATH');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('team-chat-files', '$OWNER_PATH'),
  ('team-chat-files', '$O2_PATH'),
  ('team-chat-files', 'shortpath'),
  -- Formato LEGADO <auth_uid>/<opaco> (policy de INSERT anterior a 20260928560000):
  -- objeto do Bob (auth.uid 2222...) que a policy antiga deixava o dono ler.
  ('team-chat-files', '22222222-2222-2222-2222-222222222222/legacy.png');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

# ── sessões de ator ─────────────────────────────────────────────────────────────
as_actor() { # $1 = user_id (auth.uid), $2 = SQL
  printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', false); %s" "$1" "$2"
}
ADMIN_UID='11111111-1111-1111-1111-111111111111'
OWNER_UID='22222222-2222-2222-2222-222222222222'
MEMBER_UID='33333333-3333-3333-3333-333333333333'
OUTSIDER_UID='44444444-4444-4444-4444-444444444444'

echo '── BLOCO A: comportamento ANTES da migration (o defeito) ─────────────────────────'

# A1 (RED): MEMBER (Carol) NÃO deveria ler o objeto de C2, mas a policy vulnerável
#           casa tm.media_path com profiles.name e libera.
expect_value 'A1 (defeito) membro lê objeto de conversa ALHEIA' '1' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$O2_PATH';")"
expect_value 'A1b controle: membro lê o próprio objeto da conversa' '1' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"

# A2 (controle do legado): sob a policy ANTIGA o dono lia o objeto em
# <auth_uid>/<opaco> (foldername[1] = auth.uid). Serve de contraste com o BLOCO B,
# que prova o abandono desse formato.
expect_value 'A2 controle: formato legado <auth_uid>/ era legível pelo dono' '1' \
  "$(as_actor "$OWNER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='22222222-2222-2222-2222-222222222222/legacy.png';")"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: comportamento DEPOIS da migration ────────────────────────────────────'

# B1: o vazamento fecha.
expect_value 'B1 membro NÃO lê objeto de conversa alheia' '0' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$O2_PATH';")"

# B2: membro da MESMA conversa continua lendo.
expect_value 'B2 membro lê objeto da própria conversa' '1' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"

# B3: dono da pasta (primeiro segmento = perfil) lê o próprio arquivo.
expect_value 'B3 dono da pasta lê o próprio arquivo' '1' \
  "$(as_actor "$OWNER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"

# B4: admin/supervisor lê qualquer objeto.
expect_value 'B4 admin lê objeto de outra conversa' '1' \
  "$(as_actor "$ADMIN_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$O2_PATH';")"

# B5: não-membro não lê.
expect_value 'B5 não-membro NÃO lê objeto da conversa alheia' '0' \
  "$(as_actor "$OUTSIDER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"

# B6: caminho curto/malformado nega (sem erro de cast).
expect_value 'B6 caminho curto/malformado nega' '0' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='shortpath';")"

# B14/B15: formato legado <auth_uid>/... ABANDONADO — o dono agora é
# current_profile_id (1º segmento), não auth.uid. O objeto legado do Bob deixa de
# ser legível por ele (contraste direto com A2); admin continua lendo tudo.
expect_value 'B14 formato legado <auth_uid>/ NÃO é mais legível pelo dono' '0' \
  "$(as_actor "$OWNER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='22222222-2222-2222-2222-222222222222/legacy.png';")"
expect_value 'B15 admin ainda lê o objeto legado (controle: objeto existe)' '1' \
  "$(as_actor "$ADMIN_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='22222222-2222-2222-2222-222222222222/legacy.png';")"

echo
echo '── BLOCO E: contrato de ESCRITA (policy de INSERT vigente, 20260928560000) ───────'
# O frontend grava <profile_id>/<conversation_id>/<opaco> (TeamFileUploader.tsx,
# useTeamChatDraft.ts). A policy de INSERT exige o 1º segmento = current_profile_id:
# é ela que garante que o "dono da pasta" da policy nova (profile_id) é quem de fato
# consegue gravar na pasta — sem ela o dono da policy nova seria um contrato vazio.
expect_value 'E1 upload no formato canônico é aceito (1º segmento = próprio profile)' '1' \
  "$(as_actor "$OWNER_UID" "WITH ins AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('team-chat-files','b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e2.png') RETURNING 1) SELECT count(*) FROM ins;")"
expect_error 'E2 upload com 1º segmento de OUTRO profile é recusado' \
  'violates row-level security policy' \
  "$(as_actor "$OWNER_UID" "INSERT INTO storage.objects (bucket_id, name) VALUES ('team-chat-files','c0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e2.png');")"
expect_value 'E3 objeto recém-gravado pelo dono é legível pela policy nova' '1' \
  "$(as_actor "$OWNER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/e2.png';")"

echo
echo '── CHECK de persistência de team_messages.media_path ─────────────────────────────'
# Inserts/updates rodam como postgres (superuser) para isolar o CHECK da RLS: a
# constraint é de TABELA e vale para qualquer papel, inclusive superuser.
expect_error 'B7 insert apontando para PERFIL divergente é recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','team-chat-files','c0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque.png');"

expect_error 'B8 insert apontando para CONVERSA divergente é recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','team-chat-files','b0000000-0000-0000-0000-000000000001/2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/opaque.png');"

expect_error 'B9 insert com caminho curto é recusado (sem erro de cast)' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','team-chat-files','shortpath');"

expect_error 'B10 insert com nome opaco vazio é recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','x','team-chat-files','b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/');"

# B11: controle POSITIVO — caminho canônico é aceito.
expect_value 'B11 insert com caminho canônico é aceito' '1' \
  "WITH ins AS (INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','ok','team-chat-files','b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque-ok.png') RETURNING 1) SELECT count(*) FROM ins;"

# B12: UPDATE apontando para conversa divergente é recusado.
expect_error 'B12 update apontando para conversa divergente é recusado' \
  'violates check constraint "team_messages_media_path_matches_sender_conversation"' \
  "UPDATE public.team_messages SET media_path='b0000000-0000-0000-0000-000000000001/2bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/opaque.png' WHERE media_path='b0000000-0000-0000-0000-000000000001/1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/opaque-ok.png';"

# B13: mensagem com media_bucket diferente não é afetada pela constraint.
expect_value 'B13 media_bucket diferente/nulo não é afetado' '1' \
  "WITH ins AS (INSERT INTO public.team_messages (conversation_id, sender_id, content, media_bucket, media_path) VALUES ('1aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','b0000000-0000-0000-0000-000000000001','txt',NULL,NULL) RETURNING 1) SELECT count(*) FROM ins;"

echo
echo '── Definição efetiva, roles e ausência da policy vulnerável ──────────────────────'

expect_value 'D1 policy vulnerável removida' '0' \
  "SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='Conversation members can read team chat files';"

expect_value 'D2 policy nova presente' '1' \
  "SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='Team chat files readable by owner admin or conversation member';"

expect_value 'D3 policy nova é TO authenticated' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Team chat files readable by owner admin or conversation member' AND roles = ARRAY['authenticated']::name[];"

expect_value 'D4 expressão usa objects.name (qualificação explícita)' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Team chat files readable by owner admin or conversation member' AND qual LIKE '%objects.name%';"

expect_value 'D5 expressão NÃO referencia profiles (fim do vetor via profiles.name)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Team chat files readable by owner admin or conversation member' AND qual LIKE '%profiles%';"

expect_value 'D6 CHECK de media_path presente' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conname='team_messages_media_path_matches_sender_conversation' AND contype='c';"

expect_value 'D7 policy de INSERT exige current_profile_id no 1º segmento' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='team_chat_files_insert' AND cmd='INSERT' AND roles = ARRAY['authenticated']::name[] AND with_check LIKE '%current_profile_id%';"

echo
echo '── BLOCO C: o Rollback do cabeçalho é REAL — recria leitura equivalente E segura ──'
# Executa exatamente o SQL da linha "-- Rollback:" da migration: a policy nova e o
# CHECK saem, e a leitura volta a existir com o MESMO nome de antes, MAS com
# objects.name qualificado (o vetor profiles.name não retorna) e TO authenticated.
rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration" | head -n1)"
[[ -n "$rollback_sql" ]] || fail 'migration sem linha "-- Rollback:" preenchida'
printf '%s\n' "$rollback_sql" | docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null

expect_value 'C1 rollback remove a policy nova' '0' \
  "SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='Team chat files readable by owner admin or conversation member';"
expect_value 'C2 rollback remove o CHECK de media_path' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conname='team_messages_media_path_matches_sender_conversation' AND contype='c';"
expect_value 'C3 rollback recria a policy de leitura (bucket não fica sem policy)' '1' \
  "SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='Conversation members can read team chat files';"
expect_value 'C4 policy recriada é TO authenticated' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Conversation members can read team chat files' AND roles = ARRAY['authenticated']::name[];"
expect_value 'C5 policy recriada usa objects.name qualificado (não profiles.name)' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Conversation members can read team chat files' AND qual LIKE '%objects.name%' AND qual NOT LIKE '%p.name%';"
# Comportamento da leitura recriada: membro lê a própria conversa, conversa alheia
# continua fechada (o vazamento NÃO volta) e o formato legado volta a ser legível
# pelo dono (contrato <auth_uid>/ restaurado, como no estado anterior à migration).
expect_value 'C6 membro lê objeto da própria conversa após rollback' '1' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$OWNER_PATH';")"
expect_value 'C7 membro NÃO lê objeto de conversa alheia após rollback' '0' \
  "$(as_actor "$MEMBER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='$O2_PATH';")"
expect_value 'C8 formato legado <auth_uid>/ volta a ser legível pelo dono' '1' \
  "$(as_actor "$OWNER_UID" "SELECT count(*) FROM storage.objects WHERE bucket_id='team-chat-files' AND name='22222222-2222-2222-2222-222222222222/legacy.png';")"

printf '\n[OK] contrato R2-DB-020 (ACL + persistência de media_path do Team Chat) verificado\n'
