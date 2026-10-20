#!/usr/bin/env bash
# N-141: as 9 policies de snooze/favorite/pin criadas pela 20260924230500 sem
# clausula TO (vale para PUBLIC) passam a TO authenticated.
#
# BLOCO A (antes): aplica as MIGRATIONS REAIS (policies de apoio da 20260409 +
#   a 20260924230500 inteira) e comprova o diagnostico: lista completa das 9
#   policies TO public + anon com claims forjadas da dona explorando cada
#   porta (GRAVA snooze — unico comando TO public em snoozes — e LE
#   favorito/pin) — nenhuma policy e recriada a mao neste script.
# BLOCO B (depois): aplica a migration nova e prova: 0 {public}, as 9 nomeadas
#   como {authenticated}, anon forjado ve 0 e o dono continua lendo e gravando
#   (inclusive SELECT em snoozes, pela policy de apoio TO authenticated).
# BLOCO C (rollback): extrai as linhas `--   ` do proprio arquivo da
#   migration (mecanico, sem reescrever), executa, prova que voltou a {public}
#   com a falha reaberta, e reaplica a migration (idempotencia).
#
# Vermelho: SKIP_MIGRATION=1 (simula a base sem a correcao) falha no B1;
# numa worktree da base o arquivo da migration nem existe e o script aborta.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
origin_base="$repo_root/supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql"
origin_idor="$repo_root/supabase/migrations/20260924230500_fix_contact_id_idor_snoozes_pins_favorites.sql"
migration="$repo_root/supabase/migrations/20261011003011_scope_snoozes_pins_favorites_policies_to_authenticated.sql"
postgres_image="${SNOOZES_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-snoozes-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-snoozes-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_ok() {
  local l="$1" s="$2"
  psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$origin_base" ]] || fail "origem nao encontrada: $origin_base"
[[ -f "$origin_idor" ]] || fail "origem nao encontrada: $origin_idor"
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

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

# Andaime: so tabelas/papeis/concessoes. NENHUMA policy aqui.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY, snoozed_by uuid NOT NULL, contact_id uuid, snoozed_until timestamptz);
CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL, contact_id uuid NOT NULL);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY, pinned_by uuid NOT NULL, contact_id uuid NOT NULL);

ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_snoozes TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_contacts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_conversations TO authenticated, anon;
GRANT ALL ON public.profiles TO authenticated, anon;
GRANT ALL ON public.contacts TO authenticated, anon;
SQL

# Policies de apoio (SELECT/DELETE de snoozes + "manage" originais): bytes saidos
# do proprio arquivo da 20260409, sem reescrever. As "manage" sao derrubadas
# pela 20260924230500 (DROP IF EXISTS), como em producao.
grep -E '^CREATE POLICY "Users can (view|create|delete) own snoozes" ON|^CREATE POLICY "Users can manage own (pins|favorites)" ON' \
  "$origin_base" > "$tmp_dir/apoio.sql"
[[ "$(wc -l < "$tmp_dir/apoio.sql")" == "5" ]] || fail "extracao das policies de apoio: esperado 5, obtido $(wc -l < "$tmp_dir/apoio.sql")"

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/apoio.sql"
psql_file "$origin_idor"

# Massa da prova, como superusuario (bypassa RLS): perfil/contato/linhas da dona.
UID_ALICE='11111111-1111-1111-1111-111111111111'
ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
P1='00000000-0000-0000-0000-000000000001'
C1='11111111-1111-1111-1111-111111111111'
psql_sql "INSERT INTO public.profiles (id,user_id) VALUES ('$P1','$UID_ALICE')" >/dev/null
psql_sql "INSERT INTO public.contacts (id,user_id) VALUES ('$C1','$UID_ALICE')" >/dev/null
psql_sql "INSERT INTO public.conversation_snoozes (id,snoozed_by,contact_id) VALUES ('d0000000-0000-0000-0000-000000000001','$P1','$C1')" >/dev/null
psql_sql "INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000002','$UID_ALICE','$C1')" >/dev/null
psql_sql "INSERT INTO public.pinned_conversations (id,pinned_by,contact_id) VALUES ('d0000000-0000-0000-0000-000000000003','$P1','$C1')" >/dev/null

ANON_FORJADO="SET ROLE anon; SELECT set_config('request.jwt.claims','$ALICE',false)"
DONO="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false)"
NOMES9="Users can create own snoozes|Users can view own favorites|Users can create own favorites|Users can update own favorites|Users can delete own favorites|Users can view own pins|Users can create own pins|Users can update own pins|Users can delete own pins"
LISTA9_ESPERADA="Users can create own favorites|Users can create own pins|Users can create own snoozes|Users can delete own favorites|Users can delete own pins|Users can update own favorites|Users can update own pins|Users can view own favorites|Users can view own pins"
lista_policies() { # $1 = roles ('{public}' ou '{authenticated}')
  psql_sql "SELECT string_agg(policyname, '|' ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN ('conversation_snoozes','favorite_contacts','pinned_conversations') AND policyname ~ '^Users can (create own snoozes|view own favorites|create own favorites|update own favorites|delete own favorites|view own pins|create own pins|update own pins|delete own pins)$' AND roles::text='$1'" | tail -n1
}
expect_lista() {
  local label="$1" esperado="$2" papeis="$3" atual
  atual="$(lista_policies "$papeis")"
  [[ "$atual" == "$esperado" ]] || fail "$label: esperado '$esperado', obtido '$atual'"
  printf '[PASS] %s\n' "$label"
}

echo '── BLOCO A: ANTES (migration real 20260924230500: 9 policies sem TO = public) ──'
expect_value 'A1 9 policies com papel {public} nas 3 tabelas' '9' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('conversation_snoozes','favorite_contacts','pinned_conversations') AND roles::text='{public}'"
expect_lista 'A2 lista completa das 9 policies TO public' "$LISTA9_ESPERADA" '{public}'
expect_value 'A3a anon forjado GRAVA snooze como a dona (INSERT TO public destrancado)' 'anon-inseriu-snooze' \
  "$ANON_FORJADO; INSERT INTO public.conversation_snoozes (id,snoozed_by,contact_id) VALUES ('99999999-9999-9999-9999-999999999999','$P1','$C1'); SELECT 'anon-inseriu-snooze'"
expect_value 'A3b linha do anon ficou atribuida a dona' '2' \
  "SELECT count(*) FROM public.conversation_snoozes WHERE snoozed_by='$P1'"
psql_sql "DELETE FROM public.conversation_snoozes WHERE id='99999999-9999-9999-9999-999999999999'" >/dev/null
expect_value 'A4 anon forjado LE o favorito da dona (porta destrancada)' '1' \
  "$ANON_FORJADO; SELECT count(*) FROM public.favorite_contacts"
expect_value 'A5 anon forjado LE o pin da dona (porta destrancada)' '1' \
  "$ANON_FORJADO; SELECT count(*) FROM public.pinned_conversations"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────'
if [[ "${SKIP_MIGRATION:-0}" == "1" ]]; then
  echo '(SKIP_MIGRATION=1: migration NAO aplicada — simula a base sem a correcao)'
else
  psql_file "$migration"
fi

echo
echo '── BLOCO B: DEPOIS (9 policies TO authenticated) ───────────────────────'
expect_value 'B1 0 policies com papel {public} nas 3 tabelas' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('conversation_snoozes','favorite_contacts','pinned_conversations') AND roles::text='{public}'"
expect_lista 'B2 lista completa das 9 policies TO authenticated' "$LISTA9_ESPERADA" '{authenticated}'
expect_value 'B3 anon forjado ve 0 snoozes' '0' \
  "$ANON_FORJADO; SELECT count(*) FROM public.conversation_snoozes"
expect_value 'B4 anon forjado ve 0 favoritos' '0' \
  "$ANON_FORJADO; SELECT count(*) FROM public.favorite_contacts"
expect_value 'B5 anon forjado ve 0 pins' '0' \
  "$ANON_FORJADO; SELECT count(*) FROM public.pinned_conversations"
expect_value 'B6 dona LE o proprio snooze (policy de apoio, intocada)' '1' \
  "$DONO; SELECT count(*) FROM public.conversation_snoozes"
expect_value 'B7 dona LE o proprio favorito' '1' \
  "$DONO; SELECT count(*) FROM public.favorite_contacts"
expect_value 'B8 dona LE o proprio pin' '1' \
  "$DONO; SELECT count(*) FROM public.pinned_conversations"
expect_ok 'B9 dona GRAVA snooze proprio' \
  "$DONO; INSERT INTO public.conversation_snoozes (id,snoozed_by,contact_id) VALUES ('d0000000-0000-0000-0000-000000000011','$P1','$C1')"
psql_sql "INSERT INTO public.contacts (id,user_id) VALUES ('11111111-1111-1111-1111-111111111112','$UID_ALICE')" >/dev/null
expect_ok 'B10 dona GRAVA favorito proprio' \
  "$DONO; INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000012','$UID_ALICE','11111111-1111-1111-1111-111111111112')"
psql_sql "INSERT INTO public.contacts (id,user_id) VALUES ('11111111-1111-1111-1111-111111111113','$UID_ALICE')" >/dev/null
psql_sql "INSERT INTO public.profiles (id,user_id) VALUES ('00000000-0000-0000-0000-000000000003','$UID_ALICE')" >/dev/null
expect_ok 'B11 dona GRAVA pin proprio' \
  "$DONO; INSERT INTO public.pinned_conversations (id,pinned_by,contact_id) VALUES ('d0000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111113')"
if psql_sql "$ANON_FORJADO; INSERT INTO public.conversation_snoozes (id,snoozed_by,contact_id) VALUES ('e0000000-0000-0000-0000-000000000001','$P1','$C1')" >/dev/null 2>&1; then
  fail 'B12 anon forjado GRAVOU snooze depois da correcao (INSERT ainda aberto a anon)'
else
  echo '[PASS] B12 anon forjado NAO grava snooze depois da correcao'
fi

echo
echo '── BLOCO C: ROLLBACK (extraido do proprio arquivo da migration) ───────'
grep '^--   ' "$migration" | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'bloco de rollback vazio ou ausente na migration'
psql_file "$tmp_dir/rollback.sql"
expect_lista 'C1 rollback devolve as 9 policies a {public}' "$LISTA9_ESPERADA" '{public}'
# C2 espera 2: fixture + linha B10 (a B10 gravou o 2o favorito antes do rollback).
expect_value 'C2 rollback reabre a porta (anon forjado le os 2 favoritos)' '2' \
  "$ANON_FORJADO; SELECT count(*) FROM public.favorite_contacts"
psql_file "$migration"
expect_lista 'C3 reaplicacao fecha de novo (9 em {authenticated})' "$LISTA9_ESPERADA" '{authenticated}'

printf '\n[OK] N-141: 9 policies TO public -> authenticated, com rollback provado\n'
