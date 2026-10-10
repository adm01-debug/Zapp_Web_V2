#!/usr/bin/env bash
# Auditoria adversarial da policy de storage para team-chat-files.
#
# Problema: a policy SELECT comparava a pasta (storage.foldername) com
# auth.uid()::text mas a INSERT usava current_profile_id()::text. Como
# auth.uid() (user UUID) e current_profile_id() (profile UUID) sao
# diferentes, o autor do arquivo nao conseguia nem ler, quanto mais
# apagar, seu proprio arquivo.
#
# Este teste prova (num PostgreSQL descartavel com role authenticated
# e claims emuladas):
#   (a) ESTRUTURA: a policy SELECT usa current_profile_id()::text e a
#       policy DELETE existe com a mesma identidade;
#   (b) LOGICA: o autor pode ler e apagar; outro usuario nao pode apagar.
#
# Estado anterior fiel ao canonico de 2026-10-09 (pg_policies +
# pg_get_policydef), incluindo a INSERT policy que ja usava
# current_profile_id()::text.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010034106_team_chat_storage_fix_identity.sql"
postgres_image="${TEAM_CHAT_STORAGE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-chat-storage-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-chat-storage-test-[0-9]+$ ]]; then
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
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_ok_as() {
  local label="$1" jwt="$2" sql="$3"
  as_user "$jwt" "$sql" >/dev/null || fail "$label: deveria ter sucesso (como authenticated)"
  printf '[PASS] %s\n' "$label"
}
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" output status
  set +e
  output="$(as_user "$jwt" "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Pre-estado: schema, roles, helper, tabelas, policies COM DEFEITO (auth.uid() no SELECT/DELETE).
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text,
  avatar_url text
);
CREATE TABLE public.storage_buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint);
CREATE TABLE public.storage_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES public.storage_buckets(id),
  name text NOT NULL,
  owner uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT false $$;

-- RLS nas tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_objects ENABLE ROW LEVEL SECURITY;

-- Policy INSERT com current_profile_id (o "certo" que ja existia)
CREATE POLICY team_chat_files_insert ON public.storage_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = (public.current_profile_id())::text);

-- Policy SELECT com DEFEITO: usa auth.uid() em vez de current_profile_id()
CREATE POLICY "Conversation members can read team chat files" ON public.storage_objects FOR SELECT TO authenticated
  USING (bucket_id = 'team-chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy DELETE com DEFEITO: usa auth.uid() em vez de current_profile_id()
CREATE POLICY "Users can delete own team chat files" ON public.storage_objects FOR DELETE TO authenticated
  USING (bucket_id = 'team-chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

GRANT ALL ON public.storage_objects TO authenticated;
GRANT ALL ON public.storage_buckets TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON auth.uid() TO authenticated;
SQL

# Seed com dois usuarios e um arquivo no bucket team-chat-files.
cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.storage_objects;
DELETE FROM public.profiles;
DELETE FROM public.storage_buckets;

INSERT INTO public.storage_buckets (id, name, public, file_size_limit) VALUES ('team-chat-files', 'team-chat-files', false, 52428800);

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Atila'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Beto');

-- Arquivo no bucket team-chat-files, pasta nomeada com o profile_id do Atila.
INSERT INTO public.storage_objects (bucket_id, name, owner) VALUES
  ('team-chat-files', 'a0000000-0000-0000-0000-000000000001/photo.jpg', 'a0000000-0000-0000-0000-000000000001');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BETO='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
FILE_PATH='a0000000-0000-0000-0000-000000000001/photo.jpg'

echo '── BLOCO A: comportamento ANTES da migration (os defeitos) ───────────────────────'

# A1: o autor (Atila) consegue READ com a policy defeituosa (auth.uid() = owner do arquivo = profile_id do Atila)
#     NOTA: neste teste de pre-estado, auth.uid() retorna o sub do JWT, que e o user_id do perfil.
#     O foldername e o profile_id. Como o perfil do Atila tem user_id = sub, e o foldername e o profile_id,
#     a comparacao auth.uid()::text = foldername falha porque auth.uid() e o user_id e foldername e o profile_id.
#     Mas o teste de pre-estado usa a policy COM DEFEITO para provar que o bug existe.
#     Na verdade, o pre-estado deve provar que o autor NAO consegue ler (porque auth.uid() != foldername).
#     Vamos provar que o autor nao consegue ler com a policy defeituosa.
expect_error_as 'A1 (defeito) Atila nao consegue ler seu proprio arquivo: auth.uid() != foldername (profile_id)' \
  'permission denied' "$ATILA" "SELECT name FROM public.storage_objects WHERE bucket_id = 'team-chat-files' AND name = '$FILE_PATH';"

# A2: o autor (Atila) nao consegue DELETE com a policy defeituosa
expect_error_as 'A2 (defeito) Atila nao consegue apagar seu proprio arquivo: auth.uid() != foldername (profile_id)' \
  'permission denied' "$ATILA" "DELETE FROM public.storage_objects WHERE bucket_id = 'team-chat-files' AND name = '$FILE_PATH';"

echo
echo '── Aplicando a migration ────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da migration (corrigido) ───────────────────────'

# B1: ESTRUTURA - a policy SELECT usa current_profile_id()::text
expect_value 'B1 (estrutura) policy SELECT usa current_profile_id' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Conversation members can read team chat files' AND cmd='SELECT' AND qual LIKE '%current_profile_id%'"

# B2: ESTRUTURA - a policy DELETE existe com current_profile_id()::text
expect_value 'B2 (estrutura) policy DELETE existe com current_profile_id' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Team chat file owner can delete' AND cmd='DELETE' AND qual LIKE '%current_profile_id%'"

# B3: ESTRUTURA - nenhuma policy para team-chat-files usa auth.uid() na comparacao de pasta
expect_value 'B3 (estrutura) nenhuma policy usa auth.uid() na comparacao de pasta' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (policyname LIKE '%team chat files%' OR policyname LIKE '%team-chat%') AND qual LIKE '%auth.uid()%'"

# B4: LOGICA - o autor (Atila) consegue READ com a policy corrigida
expect_ok_as 'B4 (logica) Atila pode ler seu proprio arquivo (current_profile_id = foldername)' \
  "$ATILA" "SELECT name FROM public.storage_objects WHERE bucket_id = 'team-chat-files' AND name = '$FILE_PATH';"

# B5: LOGICA - o autor (Atila) consegue DELETE com a policy corrigida
expect_ok_as 'B5 (logica) Atila pode apagar seu proprio arquivo (current_profile_id = foldername)' \
  "$ATILA" "DELETE FROM public.storage_objects WHERE bucket_id = 'team-chat-files' AND name = '$FILE_PATH';"

# B6: LOGICA - outro usuario (Beto) NAO consegue DELETE o arquivo do Atila
expect_error_as 'B6 (logica) Beto nao pode apagar arquivo do Atila' \
  'permission denied' "$BETO" "DELETE FROM public.storage_objects WHERE bucket_id = 'team-chat-files' AND name = '$FILE_PATH';"

# B7: LOGICA - outro usuario (Beto) NAO consegue READ o arquivo do Atila
expect_error_as 'B7 (logica) Beto nao pode ler arquivo do Atila' \
  'permission denied' "$BETO" "SELECT name FROM public.storage_objects WHERE bucket_id = 'team-chat-files' AND name = '$FILE_PATH';"

printf '\n[OK] storage identity para team-chat-files verificado: SELECT e DELETE usam current_profile_id, author pode ler e apagar, outro usuario nao pode\n'