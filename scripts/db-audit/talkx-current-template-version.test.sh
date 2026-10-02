#!/usr/bin/env bash
# Harness descartavel (postgres:17-alpine) do ponteiro da versao corrente do template.
#
# Reproduz o ambiente do APPLIER de migracoes em producao:
#   * o SQL e aplicado por session_user='authenticator' chamando uma funcao
#     SECURITY DEFINER (current_user vira o OWNER dela, 'postgres') — igual ao
#     applier real, onde SET ROLE e recusado com "cannot set parameter role within
#     security-definer function";
#   * o bootstrap superuser do container e 'supabase_admin' (como em Supabase), e
#     'postgres' e um papel NAO-superuser criado pelo harness — medido em producao:
#     rolsuper=false, dono do DATABASE, MEMBER de service_role
#     (pg_has_role('postgres','service_role','member')=true) e NAO dono da tabela
#     (aqui owner = talkx_owner; o applier alcanca a tabela por membership);
#   * o schema public fica com o ACL default do PG15+ — so pg_database_owner tem
#     CREATE — igual ao medido em producao (service_role=U/pg_database_owner): e por
#     isso que `ALTER FUNCTION ... OWNER TO service_role` exige o GRANT CREATE
#     temporario que a v3 faz;
#   * os guards REAIS de 20260909210000_canonicalize_talkx_template_history.sql
#     (guard_talkx_template_update e guard_talkx_template_version_immutable) estao
#     ativos, e a RPC e chamada como 'authenticated' (caminho da aplicacao).
#
# Casos (cada um em container proprio, sem estado compartilhado):
#   RED (v2)  — 20261001371230_talkx_templates_current_version_v2.sql FALHA com
#               42501 talkx_template_update_requires_authorized_rpc: reproduz o
#               deploy pos-merge que nao pode ser aplicado;
#   GREEN (v3)— 20261001381230_talkx_current_version_backfill_fix.sql aplica; o
#               backfill passa pelo guard (OWNER service_role) e todas as provas
#               abaixo ficam verdes;
#   DENTES    — 5 mutacoes da v3 derrubam EXATAMENTE a prova esperada:
#               (a) sem `ALTER FUNCTION ... OWNER TO service_role` -> rejeitada com
#                   42501 (a correcao e load-bearing);
#               (b) backfill sem mover o ponteiro -> prova do backfill falha;
#               (c) RPC sem mover o ponteiro -> prova do UPDATE falha;
#               (d) sem o REVOKE do GRANT CREATE temporario -> prova do ACL falha;
#               (e) sem o GRANT CREATE em public -> `ALTER FUNCTION ... OWNER TO
#                   service_role` falha com "permission denied for schema public".
#
# Provas GREEN mantidas (estrutura/FK, integridade, ON DELETE SET NULL no DDL) e provas
# novas: backfill aponta para o conteudo VIVO (A sem historico -> v1; B com 2 versoes
# antigas -> v3), a RPC arquiva o estado NOVO, move o ponteiro e devolve o
# version_number do conteudo vivo, repeticao nunca fica uma edicao atras. Sobre o
# ON DELETE SET NULL: medido que a acao referencial roda como o DONO da tabela que
# referencia (producao: postgres) e o guard so libera service_role, entao o SET NULL
# nao dispara — a prova de runtime registra esse bloqueio real.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_v3="${TALKX_MIGRATION_FILE:-$repo_root/supabase/migrations/20261001381230_talkx_current_version_backfill_fix.sql}"
migration_v2="${TALKX_V2_MIGRATION_FILE:-$repo_root/supabase/migrations/20261001371230_talkx_templates_current_version_v2.sql}"
postgres_image="${TALKX_CTV_POSTGRES_IMAGE:-postgres:17-alpine}"
tmp_dir="${TALKX_CTV_TMPDIR:-${TMPDIR:-$repo_root/.tmp}}"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
ok() { printf '[OK] %s\n' "$1"; }
# Mensagem curta para o log: so as linhas de erro, nao o corpo inteiro da migration.
brief() {
  local filtered
  filtered="$(printf '%s' "$1" | grep -E '^(ERROR|DETAIL|HINT|FALHA|NOTICE)' | head -4 | tr '\n' ' ' || true)"
  if [[ -n "$filtered" ]]; then printf '%s' "$filtered"; else printf '%s' "${1:0:400}"; fi
}

cid=''
work_dir=''
containers=()
cleanup() {
  local c
  for c in "${containers[@]:-}"; do
    if [[ "$c" =~ ^talkx-ctv-[0-9]+$ ]]; then docker rm -f "$c" >/dev/null 2>&1 || true; fi
  done
  if [[ -n "$work_dir" && "$work_dir" == "$tmp_dir"/talkx-ctv-mut.* ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
[[ -f "$migration_v3" ]] || fail "migration v3 nao encontrada: $migration_v3"
[[ -f "$migration_v2" ]] || fail "migration v2 nao encontrada: $migration_v2"
[[ -n "$tmp_dir" && "$tmp_dir" != '/' ]] || fail "TMPDIR invalido: '$tmp_dir'"
mkdir -p "$tmp_dir"
work_dir="$(mktemp -d "$tmp_dir/talkx-ctv-mut.XXXXXX")"

test_password='talkx_ctv_test_only'
bootstrap_user='supabase_admin'   # superuser do container, como o de Supabase
applier_user='postgres'           # current_user do applier (nao-superuser, dono do DB)
db_name='postgres'
profile_a='40000000-0000-0000-0000-00000000000a'
user_a='50000000-0000-0000-0000-00000000000a'
t_a='70000000-0000-0000-0000-0000000000a1'   # template SEM nenhuma versao
t_b='70000000-0000-0000-0000-0000000000b1'   # template COM 2 versoes antigas
ghost='99999999-9999-9999-9999-999999999999'

psql_test()   { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U "$applier_user" -d "$db_name" "$@"; }
psql_strict() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U "$bootstrap_user" -d "$db_name" "$@"; }

new_container() {
  local name="talkx-ctv-$RANDOM$RANDOM" ready=false
  docker run --rm -d --name "$name" \
    -e POSTGRES_PASSWORD="$test_password" \
    -e POSTGRES_USER="$bootstrap_user" \
    -e POSTGRES_DB="$db_name" \
    "$postgres_image" >/dev/null
  containers+=("$name")
  cid="$name"
  for _ in $(seq 1 90); do
    if [[ "$(docker logs "$name" 2>&1 | grep -c 'database system is ready to accept connections' || true)" -ge 2 ]] \
       && docker exec "$name" psql -X -U "$bootstrap_user" -d "$db_name" -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] || fail "PostgreSQL descartavel nao ficou pronto ($name)"
}

# Aplica uma migration como o applier de producao: session_user='authenticator'
# chamando uma funcao SECURITY DEFINER (current_user='postgres', SET ROLE recusado).
# Todo o SQL roda em UM statement -> uma transacao: falha = rollback total.
apply_migration() {
  local file="$1"
  { printf 'SELECT public.__applier_exec_sql($talkx_migration$\n'
    cat "$file"
    printf '\n$talkx_migration$);\n'
  } | docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U authenticator -d "$db_name" 2>&1
}

setup_fixture() {
  psql_strict >/dev/null <<'SQL'
SET client_min_messages TO warning;
-- Fase A: papeis. O bootstrap superuser e supabase_admin (como em Supabase);
-- 'postgres' e criado como papel NAO-superuser e vira DONO do database (medido em
-- producao) — e isso que lhe da CREATE no schema public sem ser superuser.
CREATE ROLE service_role NOLOGIN NOSUPERUSER;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER;
CREATE ROLE anon NOLOGIN NOSUPERUSER;
CREATE ROLE authenticator LOGIN NOSUPERUSER NOINHERIT;
CREATE ROLE talkx_owner NOLOGIN NOSUPERUSER;
CREATE ROLE postgres LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT service_role, authenticated, anon TO authenticator;
GRANT service_role TO postgres;   -- medido em producao
GRANT anon, authenticated TO postgres;   -- medido: postgres e member de anon/authenticated
GRANT talkx_owner TO postgres;    -- deixa o applier operar a tabela sem ser o dono
-- O harness faz o applier NAO ser dono da tabela (producao: talkx_templates.relowner
-- = postgres, medido). Transferir posse exige CREATE no schema para o NOVO dono, so
-- para o fixture; service_role NAO ganha nada aqui (e a prova de que ele nao tem).
GRANT CREATE ON SCHEMA public TO talkx_owner;
ALTER DATABASE postgres OWNER TO postgres;

-- Fase B: daqui pra baixo tudo roda como 'postgres', o current_user do applier.
SET ROLE postgres;

-- auth.* como em Supabase
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

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

ALTER TABLE public.profiles OWNER TO talkx_owner;
ALTER TABLE public.talkx_templates OWNER TO talkx_owner;
ALTER TABLE public.talkx_template_versions OWNER TO talkx_owner;

CREATE FUNCTION public.get_profile_id_for_user(p_user uuid) RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT p.id FROM public.profiles p WHERE p.user_id = p_user LIMIT 1
  $$;
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;

-- Stub da RPC ANTES da migration (a migration substitui o corpo). Owner = postgres,
-- como em producao: e esse owner que o guard do historico reconhece.
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

-- Guardas REAIS de 20260909210000_canonicalize_talkx_template_history.sql --------
CREATE OR REPLACE FUNCTION public.guard_talkx_template_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user = 'service_role'::name THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
     AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND NEW.use_count = OLD.use_count + 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count
     AND EXISTS (
    SELECT 1
    FROM public.talkx_template_versions AS history
    WHERE history.template_id = OLD.id
      AND history.created_at = statement_timestamp()
      AND history.saved_by = public.get_profile_id_for_user(auth.uid())
      AND history.name IS NOT DISTINCT FROM OLD.name
      AND history.description IS NOT DISTINCT FROM OLD.description
      AND history.category IS NOT DISTINCT FROM OLD.category
      AND history.content IS NOT DISTINCT FROM OLD.content
      AND history.media_url IS NOT DISTINCT FROM OLD.media_url
      AND history.media_type IS NOT DISTINCT FROM OLD.media_type
      AND history.tags IS NOT DISTINCT FROM OLD.tags
      AND history.status IS NOT DISTINCT FROM OLD.status
      AND history.custom_variables IS NOT DISTINCT FROM OLD.custom_variables
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'talkx_template_update_requires_authorized_rpc'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_talkx_template_update
  ON public.talkx_templates;
CREATE TRIGGER trg_guard_talkx_template_update
BEFORE UPDATE ON public.talkx_templates
FOR EACH ROW EXECUTE FUNCTION public.guard_talkx_template_update();

REVOKE ALL ON FUNCTION public.guard_talkx_template_update()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_talkx_template_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rpc_owner name;
BEGIN
  SELECT role.rolname INTO v_rpc_owner
  FROM pg_proc procedure
  JOIN pg_roles role ON role.oid = procedure.proowner
  WHERE procedure.oid = 'public.update_talkx_template_with_snapshot(uuid,timestamptz,text,text,text,text,text,text,text[],text,text[])'::regprocedure;

  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.talkx_templates AS template
    WHERE template.id = OLD.template_id
  ) THEN
    RETURN OLD;
  END IF;

  IF current_user IS DISTINCT FROM v_rpc_owner
     AND current_user IS DISTINCT FROM 'service_role'::name THEN
    RAISE EXCEPTION 'talkx_template_history_requires_authorized_rpc'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_talkx_template_version_immutable
  ON public.talkx_template_versions;
CREATE TRIGGER trg_guard_talkx_template_version_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_template_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_talkx_template_version_immutable();

REVOKE ALL ON FUNCTION public.guard_talkx_template_version_immutable()
  FROM PUBLIC, anon, authenticated;

-- Grants de 20260909210000 (historico so escreve pela RPC/service_role) ----------
REVOKE ALL ON TABLE public.talkx_template_versions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.talkx_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talkx_template_versions TO service_role;
-- Medido em producao: talkx_templates = service_role/authenticated com DML completo
-- (acl arwdDxtm), e e isso que permite o backfill rodar como service_role.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.talkx_templates TO authenticated, service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_talkx_template_with_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, text[], text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_talkx_template_with_snapshot(
  uuid, timestamptz, text, text, text, text, text, text, text[], text, text[]
) TO authenticated;

-- APPLIER: funcao SECURITY DEFINER (owner postgres) que recebe o SQL da migration,
-- exatamente como o applier real. SET ROLE fica proibido dentro dela.
CREATE FUNCTION public.__applier_exec_sql(p_sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $applier$
BEGIN
  EXECUTE p_sql;
END;
$applier$;
REVOKE ALL ON FUNCTION public.__applier_exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__applier_exec_sql(text) TO authenticator;

-- Fixtures: 2 templates. A SEM versao; B com 2 versoes de conteudo ANTIGO.
INSERT INTO public.profiles (id, user_id) VALUES
  ('40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a');

INSERT INTO public.talkx_templates
  (id, name, description, category, content, status, created_by, updated_at)
VALUES
  ('70000000-0000-0000-0000-0000000000a1', 'Template A', 'desc A', 'marketing',
   'Conteudo atual A', 'approved', '40000000-0000-0000-0000-00000000000a', '2026-01-01 00:00:00+00'),
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
}

# ---------------------------------------------------------------------------
# Provas GREEN
# ---------------------------------------------------------------------------
assert_green() {
  # O trigger do guard tem de estar ativo, senao a prova seria vazia.
  guard_n="$(psql_test -Atqc "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.talkx_templates'::regclass AND tgname='trg_guard_talkx_template_update' AND NOT tgisinternal")"
  [[ "$guard_n" == '1' ]] || fail "GREEN: o guard trg_guard_talkx_template_update nao esta ativo (got '$guard_n')"

  # Higiene da migration: o GRANT CREATE temporario foi revertido (ACL de public
  # intacto -> o schema-manifest nao drift) e a funcao one-shot foi dropada.
  svc_create="$(psql_test -Atqc "SELECT has_schema_privilege('service_role','public','CREATE')")"
  [[ "$svc_create" == 'f' ]] || fail "ACL: service_role nao deveria ter sobrado com CREATE em public (got '$svc_create')"
  fn_n="$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='backfill_talkx_template_current_version'")"
  [[ "$fn_n" == '0' ]] || fail "DROP: a funcao de backfill nao deveria ficar pendurada (got $fn_n)"

  # Estrutura: coluna current_version_id uuid
  col_type="$(psql_test -Atqc "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='current_version_id'")"
  [[ "$col_type" == 'uuid' ]] || fail "GREEN: coluna current_version_id deveria ser uuid (got '$col_type')"

  # Estrutura: FK current_version_id -> public.talkx_template_versions(id), ON DELETE SET NULL
  fk_def="$(psql_test -Atqc "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.talkx_templates'::regclass AND contype='f' AND pg_get_constraintdef(oid) ILIKE '%current_version_id%talkx_template_versions%' LIMIT 1")"
  [[ "$fk_def" == *'current_version_id'* && "$fk_def" == *'talkx_template_versions'* ]] || fail "GREEN: FK de current_version_id para public.talkx_template_versions ausente (got '$fk_def')"
  [[ "$fk_def" == *'ON DELETE SET NULL'* ]] || fail "GREEN: FK de current_version_id deveria ser ON DELETE SET NULL (got '$fk_def')"

  # ---- BACKFILL (a prova central) ---- #
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

  # ---- GREEN UPDATE: a RPC (chamada como 'authenticated') arquiva o estado NOVO ---- #
  expected1="$(psql_test -Atqc "SELECT updated_at::text FROM public.talkx_templates WHERE id='$t_a'")"
  out1="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_a';
SET LOCAL ROLE authenticated;
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
SET LOCAL ROLE authenticated;
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

  # ---- GREEN integridade: current_version_id inexistente viola a FK ----
  # O guard bloqueia UPDATE direto em talkx_templates, entao a prova roda no unico
  # caminho autorizado (service_role), como em producao.
  fk_err="$(psql_test -Atq 2>&1 <<SQL || true
SET ROLE service_role;
UPDATE public.talkx_templates SET current_version_id='$ghost' WHERE id='$t_a';
SQL
)"
  [[ "$fk_err" == *'foreign key'* || "$fk_err" == *'current_version_id_fkey'* ]] || fail "INTEGRIDADE: current_version_id inexistente deveria violar a FK (got '$fk_err')"
  unchanged="$(psql_test -Atqc "SELECT COALESCE(v.version_number::text,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_a'")"
  [[ "$unchanged" == '5' ]] || fail "INTEGRIDADE: current_version_id nao deveria mudar apos a violacao de FK (got '$unchanged')"

  # ---- ON DELETE SET NULL: DDL conferido acima; comportamento real medido aqui ----
  # A acao referencial de uma FK roda como o DONO da tabela que REFERENCIA (medido):
  # talkx_templates -> talkx_owner no harness e postgres em producao. O guard so
  # libera current_user='service_role', entao o SET NULL nao dispara enquanto o
  # guard existir — nem para o DELETE feito como service_role (o executor da acao e
  # o dono da tabela, nao o usuario que deleta). Prova-se o comportamento REAL:
  # o DELETE e recusado e o ponteiro permanece intacto.
  b_cur="$(psql_test -Atqc "SELECT current_version_id::text FROM public.talkx_templates WHERE id='$t_b'")"
  [[ "$b_cur" =~ ^[0-9a-f-]{36}$ ]] || fail "ON DELETE: template B deveria ter current_version_id valido (got '$b_cur')"
  del_out="$(psql_test -Atq 2>&1 <<SQL || true
SET ROLE service_role;
DELETE FROM public.talkx_template_versions WHERE id='$b_cur';
SQL
)"
  [[ "$del_out" == *'talkx_template_update_requires_authorized_rpc'* ]] \
    || fail "ON DELETE: esperava o guard barrar a acao referencial SET NULL (saida: $(brief "$del_out"))"
  b_after="$(psql_test -Atqc "SELECT COALESCE(current_version_id::text,'NULL') FROM public.talkx_templates WHERE id='$t_b'")"
  [[ "$b_after" == "$b_cur" ]] || fail "ON DELETE: o ponteiro deveria ficar INTACTO apos o bloqueio (got '$b_after')"
  gone="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_template_versions WHERE id='$b_cur'")"
  [[ "$gone" == '1' ]] || fail "ON DELETE: a versao apontada nao deveria ter sido apagada (got rows=$gone)"

  ok 'GREEN: coluna uuid + FK ON DELETE SET NULL; backfill aponta cada template para o conteudo VIVO (A=v1, B=v3); RPC arquiva o estado NOVO, move o ponteiro e devolve o version_number do conteudo vivo; acao referencial SET NULL bloqueada pelo guard (comportamento real).'
}

assert_column_absent() {
  local red_err
  red_err="$(psql_test -Atqc "SELECT current_version_id FROM public.talkx_templates LIMIT 1" 2>&1 || true)"
  [[ "$red_err" == *'does not exist'* ]] || fail "RED: coluna current_version_id deveria nao existir antes da migration (got $red_err)"
}

# ---------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------
run_case_red() {
  local out
  new_container
  setup_fixture
  assert_column_absent
  out="$(apply_migration "$migration_v2" || true)"
  [[ "$out" == *'talkx_template_update_requires_authorized_rpc'* ]] \
    || fail "RED v2: esperava a v2 ser rejeitada com 42501 talkx_template_update_requires_authorized_rpc (saida: $(brief "$out"))"
  ok "RED: a v2 (20261001371230_talkx_templates_current_version_v2.sql) FALHA com 42501 talkx_template_update_requires_authorized_rpc — reproducao do deploy pos-merge. $(printf '%s' "$out" | grep -m1 'ERROR' || true)"
}

run_case_green() {
  local out
  new_container
  setup_fixture
  assert_column_absent
  if ! out="$(apply_migration "$migration_v3")"; then
    fail "GREEN v3: a v3 nao aplicou (saida: $(brief "$out"))"
  fi
  assert_green
}

run_case_teeth() {
  local label="$1" file="$2" expect="$3" out code
  new_container
  setup_fixture
  code=0
  out="$(apply_migration "$file")" || code=$?
  if [[ "$code" != 0 ]]; then
    [[ "$out" == *"$expect"* ]] || fail "DENTES $label: a migration mutada foi rejeitada, mas sem '$expect' (saida: $(brief "$out"))"
    ok "DENTES $label: rejeitada com '$expect' — a linha mutada e load-bearing."
    return
  fi
  code=0
  out="$(assert_green 2>&1)" || code=$?
  [[ "$code" != 0 ]] || fail "DENTES $label: SOBREVIVEU — a migration mutada aplicou e todas as provas passaram."
  [[ "$out" == *"$expect"* ]] || fail "DENTES $label: a prova falhou, mas com outra mensagem (saida: $(brief "$out"))"
  ok "DENTES $label: prova derrubada com '$expect'."
}

# ---------------------------------------------------------------------------
# Mutacoes da v3 (nunca no repo: copias em TMPDIR)
# ---------------------------------------------------------------------------
build_mutations() {
  mut_owner="$work_dir/v3-sem-owner-service-role.sql"
  mut_backfill="$work_dir/v3-backfill-sem-ponteiro.sql"
  mut_rpc="$work_dir/v3-rpc-sem-mover-ponteiro.sql"
  mut_acl="$work_dir/v3-sem-revogar-create.sql"
  mut_grant="$work_dir/v3-sem-grant-create.sql"

  sed -e '/^ALTER FUNCTION public\.backfill_talkx_template_current_version() OWNER TO service_role;$/d' \
      "$migration_v3" > "$mut_owner"
  if cmp -s "$migration_v3" "$mut_owner"; then fail 'MUTACAO owner-service-role nao alterou o arquivo (ancora invalida)'; fi

  sed -e 's/SET current_version_id = arquivadas.version_id/SET current_version_id = template.current_version_id/' \
      "$migration_v3" > "$mut_backfill"
  if cmp -s "$migration_v3" "$mut_backfill"; then fail 'MUTACAO backfill-sem-ponteiro nao alterou o arquivo (ancora invalida)'; fi

  sed -e 's/SET current_version_id = v_current_version_id/SET current_version_id = current_version_id/' \
      "$migration_v3" > "$mut_rpc"
  if cmp -s "$migration_v3" "$mut_rpc"; then fail 'MUTACAO rpc-sem-mover-ponteiro nao alterou o arquivo (ancora invalida)'; fi

  # Neutraliza so o passo 6 (o REVOKE do GRANT CREATE temporario).
  sed -e "s/current_setting('talkx.backfill_granted_public_create', true) = '1'/current_setting('talkx.backfill_granted_public_create', true) = '2'/" \
      "$migration_v3" > "$mut_acl"
  if cmp -s "$migration_v3" "$mut_acl"; then fail 'MUTACAO sem-revogar-create nao alterou o arquivo (ancora invalida)'; fi

  # Remove o GRANT CREATE em public (que a posse por service_role exige).
  sed -e "s/EXECUTE 'GRANT CREATE ON SCHEMA public TO service_role';/NULL;/" \
      "$migration_v3" > "$mut_grant"
  if cmp -s "$migration_v3" "$mut_grant"; then fail 'MUTACAO sem-grant-create nao alterou o arquivo (ancora invalida)'; fi
}

printf '== talkx_current_version_backfill_fix: harness (postgres:17-alpine) ==\n'
printf 'v2 (RED)  : %s\n' "$migration_v2"
printf 'v3 (GREEN): %s\n' "$migration_v3"

build_mutations
printf '\n-- rodada 1/3: RED (v2 como esta, aplicada pelo applier de producao) --\n'
run_case_red
printf '\n-- rodada 2/3: GREEN (v3) --\n'
run_case_green
printf '\n-- rodada 3/3: DENTES (mutacoes da v3) --\n'
run_case_teeth 'dentes-owner-service-role' "$mut_owner" 'talkx_template_update_requires_authorized_rpc'
run_case_teeth 'dentes-backfill-sem-ponteiro' "$mut_backfill" 'ficaram sem current_version_id'
run_case_teeth 'dentes-rpc-sem-mover-ponteiro' "$mut_rpc" 'deveria apontar p/ a linha NOVA'
run_case_teeth 'dentes-sem-revogar-create' "$mut_acl" 'nao deveria ter sobrado com CREATE'
run_case_teeth 'dentes-sem-grant-create' "$mut_grant" 'permission denied for schema public'

printf '\n'
ok 'talkx_current_version_id: v2 reproduzida como falha (42501) e v3 aplicada com backfill pelo guard, RPC arquivando o estado NOVO e as 5 provas de dentes confirmadas.'
