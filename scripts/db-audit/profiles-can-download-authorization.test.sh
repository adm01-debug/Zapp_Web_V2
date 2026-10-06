#!/usr/bin/env bash
# R2-AUTH-027 (backlog #252): o dono de um perfil normal nao pode liberar o proprio
# flag administrativo profiles.can_download.
#
# O que ja existia em producao: a policy PERMISSIVE "Users can update own profile"
# permite o UPDATE do proprio perfil (auth.uid() = user_id), o GRANT UPDATE de
# public.profiles para authenticated esta no manifesto, e a barreira era a policy
# RESTRICTIVE "Block sensitive field changes by non-admins" — que preservava role,
# access_level, permissions e is_active, e nao citava can_download. O trigger
# prevent_profile_privilege_escalation tambem nao cobre o campo. O consumidor
# (useDownloadPermission -> ImagePreview) le profiles.can_download como autoridade.
#
# BLOCO A (ANTES): aplica as migrations REAIS que deixaram a policy restritiva
#   vigente (20260401000858 + 20260401001655 + 20260405230710) e prova o DEFEITO:
#   um authenticated nao-admin liga can_download no proprio perfil, a coluna vira
#   true e o proprio dono LE true (o consumidor passaria a liberar o download).
# BLOCO B (DEPOIS): aplica a migration REAL da correcao e prova, sob papeis reais
#   (authenticated com claims de JWT, anon), que o mesmo UPDATE nao muda mais a coluna,
#   que o dono segue editando campo nao sensivel (full_name) e que admin/supervisor
#   segue liberando can_download de outro usuario.
# BLOCO C (MUTACAO): reaplica uma COPIA temporaria da migration da correcao SEM a linha
#   do can_download (o arquivo do repo nao e editado — o proprio teste confere) e exige
#   que a assercao do BLOCO B FALHE. Sem isso o BLOCO B nao estaria provando nada.
#
# FIXTURES DECLARADAS (nao sao o objeto sob teste): pre.sql monta a superficie minima
# para as migrations REAIS rodarem — roles anon/authenticated, auth.uid() pelos claims
# de JWT, user_roles + is_admin_or_supervisor (que producao define em
# 20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql) e as tabelas citadas de
# passagem por essas migrations (gmail_accounts, whatsapp_connections, password_reset_requests,
# channel_connections, sicoob_contact_mapping, storage.objects + storage.foldername).
# As policies sobre profiles vem dos ARQUIVOS REAIS, nunca copiadas aqui.
#
# Uso:
#   [MIGRATIONS_DIR=/caminho/para/supabase/migrations] \
#     bash scripts/db-audit/profiles-can-download-authorization.test.sh
#   PROFILES_CAN_DOWNLOAD_TEST_POSTGRES_IMAGE=postgres:17-alpine (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${MIGRATIONS_DIR:-}" ]]; then
  migrations_dir="$MIGRATIONS_DIR"
elif [[ -d "$repo_root/supabase/migrations" ]]; then
  migrations_dir="$repo_root/supabase/migrations"
else
  echo '[FAIL] nao encontrei supabase/migrations (use MIGRATIONS_DIR)' >&2
  exit 1
fi

fix_migration="$(ls "$migrations_dir"/*_profiles_can_download_escalation.sql 2>/dev/null || true)"
[[ -n "$fix_migration" ]] || { echo '[FAIL] migration da correcao (*_profiles_can_download_escalation.sql) nao encontrada' >&2; exit 1; }

# Estado ANTES: as migrations REAIS que criaram as policies de SELECT e a policy
# restritiva de UPDATE vigentes em producao (nesta ordem).
declare -a antes=(
  "$migrations_dir/20260401000858_6225188d-2861-4f8e-b84b-fa68b542cbb5.sql"
  "$migrations_dir/20260401001655_509f6c72-b9c2-458c-9dc5-af298d512958.sql"
  "$migrations_dir/20260405230710_35b60740-aa0f-437d-9029-f5c0d8e1edf0.sql"
)
for m in "${antes[@]}"; do
  [[ -f "$m" ]] || { echo "[FAIL] migration base nao encontrada: $m" >&2; exit 1; }
done

postgres_image="${PROFILES_CAN_DOWNLOAD_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-can-download-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-can-download-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[PASS] %s\n' "$1"; }

psql_sql()  { docker exec -e PGOPTIONS='-c client_min_messages=warning' "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -e PGOPTIONS='-c client_min_messages=warning' -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  ok "$label"
}

# Valor de uma coluna lida como postgres (dono da tabela: ignora RLS de proposito).
valor() { psql_sql "$1" | tail -n1; }

# Roda o ataque e guarda stdout+stderr e o codigo de saida (o RLS recusa com erro).
TENTATIVA_OUT=""
TENTATIVA_RC=0
tenta() {
  local out rc
  set +e
  out="$(psql_sql "$1" 2>&1)"
  rc=$?
  set -e
  TENTATIVA_OUT="$out"
  TENTATIVA_RC="$rc"
}
# true quando o UPDATE devolveu can_download = true (a escalada passou).
retornou_true() { grep -qx 't' <<< "$TENTATIVA_OUT"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=*** "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Superficie real minima para as migrations REAIS aplicarem.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;

-- user_roles + is_admin_or_supervisor: copia fiel do helper de producao
-- (20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql).
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
     ) $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'agent',
  access_level text NOT NULL DEFAULT 'basic',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  can_download boolean NOT NULL DEFAULT false
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabelas citadas de passagem pelas migrations reais do periodo.
CREATE TABLE public.gmail_accounts (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, name text, phone_number text, status text, is_default boolean);
CREATE TABLE public.channel_connections (id uuid PRIMARY KEY);
CREATE TABLE public.sicoob_contact_mapping (id uuid PRIMARY KEY);
CREATE TABLE public.password_reset_requests (id uuid PRIMARY KEY, user_id uuid);
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id uuid PRIMARY KEY, name text, bucket_id text);
CREATE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;

-- Grants como em producao: authenticated tem UPDATE em profiles; anon so SELECT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.user_roles TO authenticated;

INSERT INTO public.profiles (user_id, full_name, role, access_level, permissions, is_active, can_download) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice', 'agent', 'basic', '{}'::jsonb, true, false),
  ('22222222-2222-2222-2222-222222222222', 'Carol', 'admin', 'admin', '{}'::jsonb, true, false),
  ('33333333-3333-3333-3333-333333333333', 'Dave',  'agent', 'basic', '{}'::jsonb, true, false);
INSERT INTO public.user_roles (user_id, role)
  VALUES ('22222222-2222-2222-2222-222222222222', 'admin');
SQL

psql_file "$tmp_dir/pre.sql"

ALICE_UID='11111111-1111-1111-1111-111111111111'
CAROL_UID='22222222-2222-2222-2222-222222222222'
DAVE_UID='33333333-3333-3333-3333-333333333333'
ALICE_CLAIMS="{\"sub\":\"$ALICE_UID\",\"role\":\"authenticated\"}"
CAROL_CLAIMS="{\"sub\":\"$CAROL_UID\",\"role\":\"authenticated\"}"

# SQLs dos caminhos de acesso, como o PostgREST faria: SET ROLE do papel + claims do JWT.
alice_escala_sql() {
  printf '%s\n' \
    'SET ROLE authenticated;' \
    "SET request.jwt.claims = '$ALICE_CLAIMS';" \
    "UPDATE public.profiles SET can_download = true WHERE user_id = '$ALICE_UID' RETURNING can_download;"
}
alice_le_flag_sql() {
  printf '%s\n' \
    'SET ROLE authenticated;' \
    "SET request.jwt.claims = '$ALICE_CLAIMS';" \
    "SELECT can_download FROM public.profiles WHERE user_id = '$ALICE_UID';"
}
alice_edita_nome_sql() {
  printf '%s\n' \
    'SET ROLE authenticated;' \
    "SET request.jwt.claims = '$ALICE_CLAIMS';" \
    "UPDATE public.profiles SET full_name = 'Alice Souza' WHERE user_id = '$ALICE_UID' RETURNING full_name;"
}
carol_libera_sql() {
  printf '%s\n' \
    'SET ROLE authenticated;' \
    "SET request.jwt.claims = '$CAROL_CLAIMS';" \
    "UPDATE public.profiles SET can_download = true WHERE user_id = '$DAVE_UID' RETURNING can_download;"
}
anon_escala_sql() {
  printf '%s\n' \
    'SET ROLE anon;' \
    "UPDATE public.profiles SET can_download = true WHERE user_id = '$ALICE_UID' RETURNING can_download;"
}

reset_alice() { psql_sql "UPDATE public.profiles SET can_download = false WHERE user_id = '$ALICE_UID'" >/dev/null; }

echo '── BLOCO A: ANTES (migrations reais, sem a correcao) ──────────────────────────────'
for m in "${antes[@]}"; do psql_file "$m"; done
assert_eq 'A1 policy restritiva vigente existe na superficie' '1' \
  "$(valor "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Block sensitive field changes by non-admins'")"
assert_eq 'A2 dono le o proprio perfil (pre-condicao do achado)' 'f' \
  "$(valor "SET ROLE authenticated; SET request.jwt.claims = '$ALICE_CLAIMS'; SELECT can_download FROM public.profiles WHERE user_id = '$ALICE_UID'")"
assert_eq 'A3 anon nao tem GRANT de UPDATE em profiles (contrato de producao)' 'f' \
  "$(valor "SELECT has_table_privilege('anon', 'public.profiles', 'UPDATE')")"

tenta "$(alice_escala_sql)"
if ! retornou_true; then
  fail "A4 defeito nao reproduzido: o UPDATE do proprio can_download nao retornou true (codigo $TENTATIVA_RC, saida: $TENTATIVA_OUT)"
fi
ok 'A4 DEFEITO: authenticated nao-admin liga can_download no proprio perfil'
assert_eq 'A5 can_download do dono virou true no banco' 't' \
  "$(valor "SELECT can_download FROM public.profiles WHERE user_id = '$ALICE_UID'")"
tenta "$(alice_le_flag_sql)"
if ! retornou_true; then
  fail "A6 o dono deveria LER o flag liberado (codigo $TENTATIVA_RC, saida: $TENTATIVA_OUT)"
fi
ok 'A6 o proprio dono le can_download = true (o consumidor liberaria o download)'
reset_alice

echo
echo '── Aplicando a migration da correcao ──────────────────────────────────────────────'
psql_file "$fix_migration"
assert_eq 'B0 policy restritiva reconstruida com a mesma identidade' '1' \
  "$(valor "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Block sensitive field changes by non-admins'")"

echo
echo '── BLOCO B: DEPOIS (correcao aplicada) ────────────────────────────────────────────'
tenta "$(alice_escala_sql)"
if retornou_true; then
  fail "B1 o dono ainda liga o proprio can_download (codigo $TENTATIVA_RC, saida: $TENTATIVA_OUT)"
fi
if (( TENTATIVA_RC == 0 )); then
  fail 'B1 esperava erro do RLS; a tentativa terminou com sucesso e sem mudar a coluna'
fi
printf '[EVIDENCIA] recusa crua do Postgres: %s\n' "$(tr '\n' ' ' <<< "$TENTATIVA_OUT" | tr -s ' ')"
ok 'B1 authenticated nao-admin NAO liga mais o proprio can_download (recusado)'
assert_eq 'B2 can_download do dono segue false' 'f' \
  "$(valor "SELECT can_download FROM public.profiles WHERE user_id = '$ALICE_UID'")"

tenta "$(alice_edita_nome_sql)"
assert_eq 'B3 dono segue editando campo nao sensivel do proprio perfil' 'Alice Souza' \
  "$(valor "SELECT full_name FROM public.profiles WHERE user_id = '$ALICE_UID'")"

tenta "$(anon_escala_sql)"
if retornou_true; then
  fail 'B4 anon conseguiu mudar can_download'
fi
assert_eq 'B4 anon nao muda can_download' 'f' \
  "$(valor "SELECT can_download FROM public.profiles WHERE user_id = '$ALICE_UID'")"

tenta "$(carol_libera_sql)"
if ! retornou_true; then
  fail "B5 admin/supervisor perdeu o caminho legitimo (codigo $TENTATIVA_RC, saida: $TENTATIVA_OUT)"
fi
ok 'B5 admin segue liberando can_download de outro usuario'
assert_eq 'B6 can_download do alvo virou true (admin)' 't' \
  "$(valor "SELECT can_download FROM public.profiles WHERE user_id = '$DAVE_UID'")"

echo
echo '── BLOCO C: MUTACAO (prova que o BLOCO B nao e vazio) ─────────────────────────────'
mutada="$tmp_dir/migration-mutada.sql"
grep -v 'AND can_download = ' "$fix_migration" > "$mutada"
if cmp -s "$fix_migration" "$mutada"; then
  fail 'C1 a mutacao nao mudou a copia (a clausula do can_download mudou de forma?)'
fi
if grep -q 'AND can_download = ' "$mutada"; then
  fail 'C1 a copia mutada ainda tem a clausula do can_download'
fi
ok 'C1 copia temporaria da migration sem a clausula do can_download'

reset_alice
psql_file "$mutada"
tenta "$(alice_escala_sql)"
if ! retornou_true; then
  fail "C2 com a clausula removida o ataque deveria voltar a passar (codigo $TENTATIVA_RC, saida: $TENTATIVA_OUT)"
fi
printf '[EVIDENCIA] sem a clausula, o mesmo UPDATE retorna can_download=true — a assercao do BLOCO B e real\n'
assert_eq 'C2 sem a clausula o ataque volta a funcionar (BLOCO B nao e tautologico)' 't' \
  "$(valor "SELECT can_download FROM public.profiles WHERE user_id = '$ALICE_UID'")"
reset_alice

grep -q 'AND can_download = ' "$fix_migration" || fail 'C3 o arquivo do repo foi alterado pela mutacao'
ok 'C3 o arquivo versionado da migration segue intacto'

printf '\n[OK] R2-AUTH-027: can_download do proprio perfil nao sobe sem admin\n'
