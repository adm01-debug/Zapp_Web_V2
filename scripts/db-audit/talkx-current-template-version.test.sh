#!/usr/bin/env bash
# Harness descartavel: talkx_templates.current_version_id + BACKFILL do estado ATUAL
# e update_talkx_template_with_snapshot arquivando o estado NOVO.
#
# Prova:
#   RED   — antes da migration a coluna current_version_id nao existe;
#   GREEN — estrutura: coluna uuid com FK p/ public.talkx_template_versions(id)
#           ON DELETE SET NULL;
#   GREEN — BACKFILL: CADA template pre-existente ganha current_version_id NAO NULO
#           apontando para uma versao cujo content/name/category/status == conteudo VIVO
#           (o template sem versao ficou v1; o que tinha 2 versoes antigas ficou v3);
#   GREEN — a RPC grava o conteudo novo, arquiva uma linha NOVA com esse conteudo,
#           move current_version_id para ela e devolve o version_number DESSA linha
#           nova (nao da anterior);
#   GREEN — repeticao: um 2o UPDATE gera outra versao e move o ponteiro de novo
#           (nunca fica uma edicao atras);
#   GREEN — integridade: current_version_id inexistente e barrado pela FK;
#   GREEN — ON DELETE SET NULL: apagar a versao apontada deixa current_version_id NULL.
#
# fixtures montadas ANTES da migration: 2 templates — um SEM versao nenhuma e outro
# com 2 versoes ja arquivadas de conteudo ANTIGO — para o backfill ter o que fazer.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="${TALKX_MIGRATION_FILE:-$repo_root/supabase/migrations/20261001331230_talkx_templates_current_version.sql}"
fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }
psql_strict() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

test_password='talkx_ctv_test_only'
cid="talkx-ctv-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-ctv-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
[[ -f "$migration_file" ]] || fail "migration nao encontrada: $migration_file"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- identificadores do teste ---- #
profile_a='40000000-0000-0000-0000-00000000000a'
user_a='50000000-0000-0000-0000-00000000000a'
t_a='70000000-0000-0000-0000-0000000000a1'   # template SEM nenhuma versao
t_b='70000000-0000-0000-0000-0000000000b1'   # template COM 2 versoes antigas
b_v1='80000000-0000-0000-0000-0000000000b1'
b_v2='80000000-0000-0000-0000-0000000000b2'
ghost='99999999-9999-9999-9999-999999999999'

# ---- fixtures minimos, ANTES da migration ---- #
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- talkx_templates ANTES da migration: SEM current_version_id (a migration a adiciona).
CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL,
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'approved',
  custom_variables text[] NOT NULL DEFAULT '{}'::text[],
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  description text,
  content text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  custom_variables text[] NOT NULL DEFAULT '{}'::text[],
  saved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT talkx_template_versions_template_id_version_number_key UNIQUE (template_id, version_number)
);

CREATE FUNCTION public.get_profile_id_for_user(p_user uuid) RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT p.id FROM public.profiles p WHERE p.user_id = p_user LIMIT 1
  $$;
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;

-- Stub da RPC ANTES da migration: mesma assinatura, mas nao arquiva o estado NOVO.
-- (A migration substitui este corpo por CREATE OR REPLACE.)
CREATE FUNCTION public.update_talkx_template_with_snapshot(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_description text,
  p_category text,
  p_content text,
  p_media_url text,
  p_media_type text,
  p_tags text[],
  p_status text,
  p_custom_variables text[]
) RETURNS TABLE(template_id uuid, updated_at timestamptz, version_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
BEGIN
  RAISE EXCEPTION 'talkx_ctv_stub_rpc_nao_substituida' USING ERRCODE = '0A000';
END;
$f$;

INSERT INTO public.profiles (id, user_id) VALUES
  ('40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a');

-- Template A: NENHUMA versao arquivada; o conteudo vivo e a unica fonte.
INSERT INTO public.talkx_templates
  (id, name, description, category, content, status, created_by, updated_at)
VALUES
  ('70000000-0000-0000-0000-0000000000a1', 'Template A', 'desc A', 'marketing',
   'Conteudo atual A', 'approved', '40000000-0000-0000-0000-00000000000a', '2026-01-01 00:00:00+00');

-- Template B: DUAS versoes ja arquivadas, com conteudo ANTIGO (diferente do vivo).
INSERT INTO public.talkx_templates
  (id, name, description, category, content, status, created_by, updated_at)
VALUES
  ('70000000-0000-0000-0000-0000000000b1', 'Template B', 'desc B', 'vendas',
   'Conteudo atual B', 'draft', '40000000-0000-0000-0000-00000000000a', '2026-01-01 00:00:00+00');

INSERT INTO public.talkx_template_versions
  (id, template_id, version_number, name, description, content, category, status)
VALUES
  ('80000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b1', 1,
   'Template B antigo 1', 'desc B antiga 1', 'Conteudo ANTIGO B1', 'vendas', 'draft'),
  ('80000000-0000-0000-0000-0000000000b2', '70000000-0000-0000-0000-0000000000b1', 2,
   'Template B antigo 2', 'desc B antiga 2', 'Conteudo ANTIGO B2', 'vendas', 'draft');
SQL

# ---- RED: a coluna current_version_id nao existe antes da migration ---- #
red_err="$(psql_test -Atqc "SELECT current_version_id FROM public.talkx_templates LIMIT 1" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: coluna current_version_id deveria nao existir antes da migration (got $red_err)"

# ---- GREEN: aplica a migration (ON_ERROR_STOP=1: erro aborta de verdade) ---- #
psql_strict < "$migration_file" >/dev/null || fail 'migration nao aplicou (GREEN)'

# Estrutura: coluna current_version_id uuid
col_type="$(psql_test -Atqc "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='current_version_id'")"
[[ "$col_type" == 'uuid' ]] || fail "GREEN: coluna current_version_id deveria ser uuid (got '$col_type')"

# Estrutura: FK current_version_id -> public.talkx_template_versions(id), ON DELETE SET NULL
fk_def="$(psql_test -Atqc "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.talkx_templates'::regclass AND contype='f' AND pg_get_constraintdef(oid) ILIKE '%current_version_id%talkx_template_versions%' LIMIT 1")"
[[ "$fk_def" == *'current_version_id'* && "$fk_def" == *'talkx_template_versions'* ]] || fail "GREEN: FK de current_version_id para public.talkx_template_versions ausente (got '$fk_def')"
[[ "$fk_def" == *'ON DELETE SET NULL'* ]] || fail "GREEN: FK de current_version_id deveria ser ON DELETE SET NULL (got '$fk_def')"

# ---- BACKFILL (a prova mais importante) ---- #
null_count="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_templates WHERE current_version_id IS NULL")"
[[ "$null_count" == '0' ]] || fail "BACKFILL: $null_count template(s) ficaram sem current_version_id"

# Template A (sem versao): backfill cria v1 = estado vivo; ponteiro -> v1.
row_a="$(psql_test -Atqc "SELECT COALESCE(v.version_number::text,'<null>') || '|' || COALESCE(v.content,'<null>') || '|' || COALESCE(v.name,'<null>') || '|' || COALESCE(v.category,'<null>') || '|' || COALESCE(v.status,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_a'")"
[[ "$row_a" == '1|Conteudo atual A|Template A|marketing|approved' ]] || fail "BACKFILL: template A (sem versao) deveria apontar p/ v1 com o conteudo VIVO (got '$row_a')"

# Template B (2 versoes de conteudo ANTIGO): backfill cria v3 = estado vivo; ponteiro -> v3.
row_b="$(psql_test -Atqc "SELECT COALESCE(v.version_number::text,'<null>') || '|' || COALESCE(v.content,'<null>') || '|' || COALESCE(v.name,'<null>') || '|' || COALESCE(v.category,'<null>') || '|' || COALESCE(v.status,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_b'")"
[[ "$row_b" == '3|Conteudo atual B|Template B|vendas|draft' ]] || fail "BACKFILL: template B (2 versoes antigas) deveria apontar p/ v3 com o conteudo VIVO (got '$row_b')"

# A versao corrente de B NAO pode ser uma das antigas.
old_b="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_templates t JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_b' AND v.content IN ('Conteudo ANTIGO B1','Conteudo ANTIGO B2')")"
[[ "$old_b" == '0' ]] || fail "BACKFILL: current_version_id de B nao pode apontar p/ conteudo ANTIGO (got $old_b)"

# ---- GREEN UPDATE: a RPC arquiva o estado NOVO e move o ponteiro ---- #
expected1="$(psql_test -Atqc "SELECT updated_at::text FROM public.talkx_templates WHERE id='$t_a'")"
out1="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_a';
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$t_a', '$expected1'::timestamptz, 'Template A v2', NULL, 'marketing',
    'Conteudo NOVO A', NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
COMMIT;
SQL
)"
ret_tid="${out1%%|*}"; rest="${out1#*|}"; ret_v1="${rest##*|}"
[[ "$ret_tid" == "$t_a" ]] || fail "UPDATE: a RPC deveria devolver o template_id '$t_a' (got '$out1')"
[[ "$ret_v1" == '3' ]] || fail "UPDATE: a RPC deveria devolver o version_number da linha NOVA v3, nao a anterior (got '$out1')"

live1="$(psql_test -Atqc "SELECT content FROM public.talkx_templates WHERE id='$t_a'")"
[[ "$live1" == 'Conteudo NOVO A' ]] || fail "UPDATE: o conteudo VIVO deveria mudar (got '$live1')"

new_rows="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_template_versions WHERE template_id='$t_a' AND content='Conteudo NOVO A'")"
[[ "$new_rows" == '1' ]] || fail "UPDATE: deveria existir exatamente 1 linha NOVA arquivada com o conteudo novo (got $new_rows)"

cur1="$(psql_test -Atqc "SELECT COALESCE(v.version_number::text,'<null>') || '|' || COALESCE(v.content,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_a'")"
[[ "$cur1" == '3|Conteudo NOVO A' ]] || fail "UPDATE: current_version_id deveria apontar p/ a linha NOVA v3 com o conteudo novo (got '$cur1')"

# ---- GREEN repeticao: 2o UPDATE gera outra versao e move o ponteiro de novo ---- #
expected2="$(psql_test -Atqc "SELECT updated_at::text FROM public.talkx_templates WHERE id='$t_a'")"
out2="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_a';
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$t_a', '$expected2'::timestamptz, 'Template A v3', NULL, 'marketing',
    'Conteudo NOVO A 2', NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
COMMIT;
SQL
)"
ret_v2="${out2##*|}"
[[ "$ret_v2" == '5' ]] || fail "REPETICAO: a 2a edicao deveria devolver o version_number v5 (got '$out2')"

live2="$(psql_test -Atqc "SELECT content FROM public.talkx_templates WHERE id='$t_a'")"
[[ "$live2" == 'Conteudo NOVO A 2' ]] || fail "REPETICAO: o conteudo VIVO deveria ser o 2o novo (got '$live2')"

maxv="$(psql_test -Atqc "SELECT max(version_number) FROM public.talkx_template_versions WHERE template_id='$t_a'")"
cur2="$(psql_test -Atqc "SELECT COALESCE(v.version_number::text,'<null>') || '|' || COALESCE(v.content,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_a'")"
[[ "$cur2" == "$ret_v2|Conteudo NOVO A 2" ]] || fail "REPETICAO: current_version_id deveria apontar p/ a 2a linha nova (got '$cur2')"
[[ "$maxv" == "$ret_v2" ]] || fail "REPETICAO: o ponteiro deveria estar na MAIOR versao (max=$maxv, ret=$ret_v2) — nunca uma edicao atras"

# ---- GREEN integridade: current_version_id inexistente viola a FK ---- #
fk_err="$(psql_test -Atq 2>&1 <<SQL || true
UPDATE public.talkx_templates SET current_version_id='$ghost' WHERE id='$t_a';
SQL
)"
[[ "$fk_err" == *'foreign key'* || "$fk_err" == *'current_version_id_fkey'* ]] || fail "INTEGRIDADE: current_version_id inexistente deveria violar a FK (got '$fk_err')"
unchanged="$(psql_test -Atqc "SELECT COALESCE(v.version_number::text,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_a'")"
[[ "$unchanged" == '5' ]] || fail "INTEGRIDADE: current_version_id nao deveria mudar apos a violacao de FK (got '$unchanged')"

# ---- GREEN ON DELETE SET NULL: apagar a versao apontada zera a coluna ---- #
b_cur="$(psql_test -Atqc "SELECT current_version_id::text FROM public.talkx_templates WHERE id='$t_b'")"
[[ "$b_cur" =~ ^[0-9a-f-]{36}$ ]] || fail "ON DELETE: template B deveria ter current_version_id valido (got '$b_cur')"
psql_test -Atqc "DELETE FROM public.talkx_template_versions WHERE id='$b_cur'" >/dev/null
gone="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_template_versions WHERE id='$b_cur'")"
[[ "$gone" == '0' ]] || fail "ON DELETE: a versao apontada deveria ter sido apagada (got rows=$gone)"
b_after="$(psql_test -Atqc "SELECT COALESCE(current_version_id::text,'NULL') FROM public.talkx_templates WHERE id='$t_b'")"
[[ "$b_after" == 'NULL' ]] || fail "ON DELETE SET NULL: current_version_id deveria ficar NULL apos apagar a versao (got '$b_after')"

echo '[OK] talkx_templates.current_version_id: coluna uuid (FK->talkx_template_versions, ON DELETE SET NULL) criada; backfill aponta cada template para a versao do conteudo VIVO (A=v1, B=v3); update_talkx_template_with_snapshot arquiva o estado NOVO, move o ponteiro e devolve o version_number do conteudo vivo.'
