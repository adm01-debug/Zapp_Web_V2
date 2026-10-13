#!/usr/bin/env bash
# Figurinha PESSOAL (stickers.owner_id) — a "só sua" não pode aparecer na biblioteca
# compartilhada, e o dono NÃO-admin precisa subir/ver/excluir a própria figurinha.
#
# Só a parte de BANCO do achado, em PostgreSQL descartável, com as MIGRATIONS REAIS que definem
# as policies (aplicadas na ordem de versão) e executando como o PAPEL REAL (`authenticated`,
# `anon`), nunca como postgres.
#
# Contrato real do app:
#   src/hooks/integrations/usePersonalStickers.ts — grava a linha da pessoal com
#       owner_id = profiles.id e uploaded_by = profiles.id, e o objeto em
#       `pessoal/<profiles.id>/<uuid>.<ext>`;
#   src/hooks/sticker-picker/useStickerPicker.ts — a compartilhada é owner_id IS NULL,
#       uploaded_by = auth.uid(), objeto na raiz do bucket ('sticker_<ts>_<uuid>.<ext>').
# Neste projeto profiles.id <> auth.uid() (por isso existe get_profile_id_for_user).
#
#   RED   — estado anterior (migrations reais, sem a correção), medido como `authenticated`:
#             (a) VAZAMENTO: P2 lê a figurinha pessoal de P1 (SELECT USING true) e lista o
#                 objeto pessoal de P1 no bucket;
#             (b) o próprio P1 NÃO consegue INSERT nem DELETE da sua figurinha pessoal
#                 (uploaded_by = profiles.id <> auth.uid());
#             (c) o upload para a pasta `pessoal/<profiles.id>/...` é recusado;
#             (d) P2 (terceiro) exclui a figurinha pessoal de P1 pela API.
#   GREEN — com a migration 20261013181309 aplicada (ON_ERROR_STOP=1):
#             (a) pessoal fica privada: P1 vê a sua, P2 NÃO vê a de P1; a compartilhada
#                 (owner_id NULL) segue visível para os dois; admin vê todas;
#             (b) o dono NÃO-admin sobe, favorita e exclui a própria figurinha pessoal;
#             (c) terceiro não lê, não lista e não exclui o objeto pessoal alheio; admin lê;
#             (d) upload na própria pasta `pessoal/<profiles.id>/` e no caminho `<auth.uid()>/`
#                 funciona; upload na pasta de OUTRO perfil é recusado; nada afrouxou.
#   ROLLBACK — o bloco `-- Rollback (SQL executável, na ordem)` do próprio arquivo roda e
#             devolve o estado anterior (o vazamento volta).
#
# O pré-estado do Supabase (schema auth/storage, papéis, tabelas de domínio e grants) é
# recriado à mão, como nos harnesses irmãos, porque é infraestrutura da plataforma — o que a
# migration muda (as policies) vem dos ARQUIVOS REAIS de supabase/migrations/.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
migration_file="20261013181309_stickers_pessoais_rls_e_storage_por_dono.sql"
postgres_image="${STICKERS_PERSONAL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-stickers-personal-$$"

# Migrations REAIS que montam o estado anterior, na ordem de versão:
#   20260318124324 — policies de propriedade de public.stickers (insert/update/delete).
#   20260511233306 — BLOCK 12: buckets + policies de storage.objects (bucket 'stickers').
real_migrations=(
  "20260318124324_ec0c654d-4122-4328-940c-4db9fadfebf3.sql"
  "20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql"
)

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-stickers-personal-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
psql_sql()  { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

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

# ── tabelas de domínio + helpers reais (corpos canônicos das migrations) ──────────────────────
# public.stickers: DDL real (20260317234558) + coluna owner_id (20260409003146, FK profiles.id).
# A policy de SELECT do estado anterior ('Authenticated users can view stickers', USING true)
# vem de 20260317234558 — recriada aqui só para completar o pré-estado.
psql_sql "
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text,
  email text,
  role text DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.team_conversations (id uuid PRIMARY KEY, type text NOT NULL DEFAULT 'direct');
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE public.stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  image_url TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  uploaded_by TEXT NULL,
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  owner_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY \"Authenticated users can view stickers\"
  ON public.stickers FOR SELECT TO authenticated USING (true);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')) \$\$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- corpo canônico de 20260909200000
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS \$\$ SELECT profile.id FROM public.profiles AS profile
         WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1 \$\$;
REVOKE ALL ON FUNCTION public.get_profile_id_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, service_role;

GRANT SELECT ON public.profiles, public.user_roles TO authenticated, service_role;
-- storage.objects tem policies reais (20260511233306) que leem estas tabelas na avaliacao.
GRANT SELECT ON public.contacts, public.team_conversations, public.team_conversation_members
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stickers TO authenticated, service_role;
-- anon recebe SELECT na tabela para que a RECUSA venha da RLS (policy TO authenticated), nao do grant.
GRANT SELECT ON public.stickers TO anon;
" >/dev/null

# ── estado ANTERIOR: as migrations REAIS, na ordem ────────────────────────────────────────────
for m in "${real_migrations[@]}"; do
  [[ -f "$migrations_dir/$m" ]] || fail "migration real ausente: $m"
  printf '  · aplicando %s\n' "$m" >&2
  psql_file "$migrations_dir/$m" >/dev/null
done

# ── dados sintéticos (como postgres, sem RLS) ─────────────────────────────────────────────────
# P1 (Ana) e P2 (Bruno): agentes comuns, profiles.id <> auth.uid(). ADM: admin.
psql_sql "
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bruno'),
  ('44444444-4444-4444-4444-444444444444', 'dddddddd-0000-0000-0000-000000000004', 'Dora');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('dddddddd-0000-0000-0000-000000000004', 'admin');
-- figurinhas: pessoal de P1, pessoal de P2, compartilhada (owner_id NULL), pessoal temporaria de P1
INSERT INTO public.stickers (id, name, image_url, category, uploaded_by, owner_id) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', 'pessoal-P1', 'https://exemplo.invalid/pessoal-p1.webp', 'pessoal', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('bbbb2222-2222-2222-2222-222222222222', 'pessoal-P2', 'https://exemplo.invalid/pessoal-p2.webp', 'pessoal', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('cccc3333-3333-3333-3333-333333333333', 'compartilhada', 'https://exemplo.invalid/shared.webp', 'geral', 'aaaaaaaa-0000-0000-0000-000000000001', NULL),
  ('dddd4444-4444-4444-4444-444444444444', 'pessoal-P1-tmp', 'https://exemplo.invalid/pessoal-p1-tmp.webp', 'pessoal', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
-- objetos do bucket 'stickers': pessoal de P1 (a/b) e compartilhado na raiz
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('stickers', 'pessoal/11111111-1111-1111-1111-111111111111/a.webp'),
  ('stickers', 'pessoal/11111111-1111-1111-1111-111111111111/b.webp'),
  ('stickers', 'sticker_1_shared.webp');
" >/dev/null

JWT_P1='{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}'
JWT_P2='{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}'
JWT_ADM='{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}'

P1='11111111-1111-1111-1111-111111111111'
P2='22222222-2222-2222-2222-222222222222'
S_P1='aaaa1111-1111-1111-1111-111111111111'
S_P2='bbbb2222-2222-2222-2222-222222222222'
S_SHARED='cccc3333-3333-3333-3333-333333333333'
S_TMP='dddd4444-4444-4444-4444-444444444444'
OBJ_P1_A='pessoal/11111111-1111-1111-1111-111111111111/a.webp'
OBJ_P1_B='pessoal/11111111-1111-1111-1111-111111111111/b.webp'

printf '\n== RED: estado anterior (migrations reais, sem a correção) ==\n'
expect_value_as 'RED: P2 lê a figurinha PESSOAL de P1 (SELECT USING true) — vazamento' \
  '1' "$JWT_P2" "SELECT count(*) FROM public.stickers WHERE id = '$S_P1'"
expect_value_as 'RED: P2 lista o OBJETO pessoal de P1 no bucket' \
  '1' "$JWT_P2" "SELECT count(*) FROM storage.objects WHERE name = '$OBJ_P1_A'"
expect_error_as 'RED: P1 (dono não-admin) NÃO consegue subir a própria figurinha pessoal' \
  'row-level security' "$JWT_P1" \
  "INSERT INTO public.stickers (name, image_url, category, uploaded_by, owner_id) VALUES ('pessoal-nova','https://exemplo.invalid/n.webp','pessoal','$P1','$P1')"
expect_value_as 'RED: P1 (dono não-admin) NÃO exclui a própria figurinha pessoal (0 linhas)' \
  '0' "$JWT_P1" "WITH d AS (DELETE FROM public.stickers WHERE id = '$S_TMP' RETURNING 1) SELECT count(*) FROM d"
expect_error_as 'RED: upload na pasta pessoal do próprio perfil é recusado (foldername[1] <> auth.uid)' \
  'row-level security' "$JWT_P1" \
  "INSERT INTO storage.objects (bucket_id, name) VALUES ('stickers', 'pessoal/$P1/c.webp')"

printf '\n== GREEN: aplicando %s ==\n' "$migration_file"
psql_file "$migrations_dir/$migration_file" >/dev/null
printf '  · (idempotência) reaplicando a mesma migration\n' >&2
psql_file "$migrations_dir/$migration_file" >/dev/null

printf '\n== GREEN: figurinha pessoal é privada ==\n'
expect_value_as 'P1 vê a própria figurinha pessoal' \
  '1' "$JWT_P1" "SELECT count(*) FROM public.stickers WHERE id = '$S_P1'"
expect_value_as 'P2 NÃO vê a figurinha pessoal de P1' \
  '0' "$JWT_P2" "SELECT count(*) FROM public.stickers WHERE id = '$S_P1'"
expect_value_as 'P1 NÃO vê a figurinha pessoal de P2' \
  '0' "$JWT_P1" "SELECT count(*) FROM public.stickers WHERE id = '$S_P2'"
expect_value_as 'P2 vê a própria figurinha pessoal' \
  '1' "$JWT_P2" "SELECT count(*) FROM public.stickers WHERE id = '$S_P2'"
expect_value_as 'a COMPARTILHADA (owner_id NULL) segue visível para P1' \
  '1' "$JWT_P1" "SELECT count(*) FROM public.stickers WHERE id = '$S_SHARED'"
expect_value_as 'a COMPARTILHADA (owner_id NULL) segue visível para P2' \
  '1' "$JWT_P2" "SELECT count(*) FROM public.stickers WHERE id = '$S_SHARED'"
expect_value_as 'admin vê a figurinha pessoal de P1' \
  '1' "$JWT_ADM" "SELECT count(*) FROM public.stickers WHERE id = '$S_P1'"
expect_value_as 'admin vê a figurinha pessoal de P2' \
  '1' "$JWT_ADM" "SELECT count(*) FROM public.stickers WHERE id = '$S_P2'"
[[ "$(as_anon "SELECT count(*) FROM public.stickers" | tail -n1)" == '0' ]] \
  || fail 'anon leu figurinha'
pass 'anon não lê figurinha nenhuma'

printf '\n== GREEN: o dono não-admin mantém a própria figurinha pessoal ==\n'
expect_ok_as 'P1 sobe a própria figurinha pessoal (INSERT owner_id = profiles.id)' \
  "$JWT_P1" \
  "INSERT INTO public.stickers (name, image_url, category, uploaded_by, owner_id) VALUES ('pessoal-nova','https://exemplo.invalid/n.webp','pessoal','$P1','$P1')"
expect_error_as 'P1 NÃO sobe figurinha pessoal para OUTRO perfil' \
  'row-level security' "$JWT_P1" \
  "INSERT INTO public.stickers (name, image_url, category, uploaded_by, owner_id) VALUES ('pessoal-x','https://exemplo.invalid/x.webp','pessoal','$P2','$P2')"
expect_value_as 'P1 favorita a própria figurinha pessoal (UPDATE 1 linha)' \
  '1' "$JWT_P1" "WITH u AS (UPDATE public.stickers SET is_favorite = true WHERE id = '$S_P1' RETURNING 1) SELECT count(*) FROM u"
expect_value_as 'P1 exclui a própria figurinha pessoal (1 linha)' \
  '1' "$JWT_P1" "WITH d AS (DELETE FROM public.stickers WHERE id = '$S_TMP' RETURNING 1) SELECT count(*) FROM d"
expect_value_as 'P2 NÃO exclui a figurinha pessoal de P1 (0 linhas)' \
  '0' "$JWT_P2" "WITH d AS (DELETE FROM public.stickers WHERE id = '$S_P1' RETURNING 1) SELECT count(*) FROM d"

printf '\n== GREEN: storage do bucket stickers ==\n'
expect_value_as 'P1 lê o próprio objeto pessoal' \
  '1' "$JWT_P1" "SELECT count(*) FROM storage.objects WHERE name = '$OBJ_P1_A'"
expect_value_as 'P2 NÃO lê o objeto pessoal de P1' \
  '0' "$JWT_P2" "SELECT count(*) FROM storage.objects WHERE name = '$OBJ_P1_A'"
expect_value_as 'admin lê o objeto pessoal de P1' \
  '1' "$JWT_ADM" "SELECT count(*) FROM storage.objects WHERE name = '$OBJ_P1_A'"
expect_value_as 'o objeto COMPARTILHADO (raiz) segue visível para P2' \
  '1' "$JWT_P2" "SELECT count(*) FROM storage.objects WHERE name = 'sticker_1_shared.webp'"
expect_ok_as 'P1 sobe objeto na própria pasta pessoal' \
  "$JWT_P1" \
  "INSERT INTO storage.objects (bucket_id, name) VALUES ('stickers', 'pessoal/$P1/novo.webp')"
expect_ok_as 'P1 sobe objeto no caminho <auth.uid>/... (comportamento antigo preservado)' \
  "$JWT_P1" \
  "INSERT INTO storage.objects (bucket_id, name) VALUES ('stickers', 'aaaaaaaa-0000-0000-0000-000000000001/y.webp')"
expect_error_as 'P1 NÃO sobe objeto na pasta pessoal de P2' \
  'row-level security' "$JWT_P1" \
  "INSERT INTO storage.objects (bucket_id, name) VALUES ('stickers', 'pessoal/$P2/z.webp')"
expect_value_as 'P1 exclui o próprio objeto pessoal (1 linha)' \
  '1' "$JWT_P1" "WITH d AS (DELETE FROM storage.objects WHERE name = '$OBJ_P1_B' RETURNING 1) SELECT count(*) FROM d"
expect_value_as 'P2 NÃO exclui o objeto pessoal de P1 (0 linhas)' \
  '0' "$JWT_P2" "WITH d AS (DELETE FROM storage.objects WHERE name = '$OBJ_P1_A' RETURNING 1) SELECT count(*) FROM d"
[[ "$(as_anon "SELECT count(*) FROM storage.objects WHERE name = '$OBJ_P1_A'" | tail -n1)" == '0' ]] \
  || fail 'anon listou objeto pessoal'
pass 'anon não lista objeto pessoal'

printf '\n== ROLLBACK: o bloco executável do arquivo devolve o estado anterior ==\n'
rollback_sql="$(awk 'f && /^--   /{sub(/^--   /,""); print; next} f{exit} /^-- Rollback \(SQL/{f=1}' "$migrations_dir/$migration_file")"
[[ -n "$rollback_sql" ]] || fail 'não consegui extrair o rollback do arquivo'
psql_sql "$rollback_sql" >/dev/null
expect_value_as 'ROLLBACK: P2 volta a ler a figurinha pessoal de P1 (estado anterior restaurado)' \
  '1' "$JWT_P2" "SELECT count(*) FROM public.stickers WHERE id = '$S_P1'"
expect_error_as 'ROLLBACK: P1 volta a NÃO conseguir subir a própria figurinha pessoal' \
  'row-level security' "$JWT_P1" \
  "INSERT INTO public.stickers (name, image_url, category, uploaded_by, owner_id) VALUES ('x','https://exemplo.invalid/x.webp','pessoal','$P1','$P1')"

printf '\nOK: figurinha pessoal privada e mantida pelo dono (RED antes, GREEN depois, ROLLBACK provado).\n'
