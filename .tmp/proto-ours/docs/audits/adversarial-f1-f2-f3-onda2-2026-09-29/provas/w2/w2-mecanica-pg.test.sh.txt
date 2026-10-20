#!/usr/bin/env bash
# ONDA 2 - provas MECANICAS que sustentam o relatorio. Nao usa o superuser como dono:
# prova que SECURITY DEFINER ignorando RLS e comportamento do DONO, nao privilegio de
# superusuario - e que FORCE ROW LEVEL SECURITY fecha isso. Prova tambem que
# CREATE OR REPLACE FUNCTION PRESERVA a ACL (base do achado "multiplix continua
# service_role-only", ja que as tres funcoes do motor sao CREATE OR REPLACE em 29/09).
set -uo pipefail
container_name="zapp-w2-mecanica-$$"
cleanup() { [[ "$container_name" =~ ^zapp-w2-mecanica-[0-9]+$ ]] && docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=w2_fixture_only postgres:17-alpine >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -c 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || { echo 'FAIL: PostgreSQL de teste nao iniciou'; exit 1; }

probe() {
  local label="$1" sql="$2" out st
  out="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; st=$?
  printf 'PROBE|%s|exit=%s|%s\n' "$label" "$st" "$(printf '%s' "$out" | tr '\n' '~' | cut -c1-500)"
}
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

echo "### HARNESS ativo: provas mecanicas - PostgreSQL 17 descartavel"
psql_sql "
CREATE ROLE app_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE app_user  NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA app AUTHORIZATION app_owner;
SET ROLE app_owner;
CREATE TABLE app.livre (id int PRIMARY KEY);
ALTER TABLE app.livre ENABLE ROW LEVEL SECURITY;
CREATE POLICY nenhum ON app.livre FOR INSERT TO app_user WITH CHECK (false);
CREATE TABLE app.forcada (id int PRIMARY KEY);
ALTER TABLE app.forcada ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.forcada FORCE ROW LEVEL SECURITY;
CREATE POLICY nenhum_f ON app.forcada FOR INSERT TO app_user WITH CHECK (false);
CREATE FUNCTION app.insere_livre() RETURNS int LANGUAGE sql SECURITY DEFINER
  SET search_path=app AS 'INSERT INTO app.livre VALUES (1) RETURNING id';
CREATE FUNCTION app.insere_forcada() RETURNS int LANGUAGE sql SECURITY DEFINER
  SET search_path=app AS 'INSERT INTO app.forcada VALUES (1) RETURNING id';
RESET ROLE;
GRANT USAGE ON SCHEMA app TO app_user;
GRANT EXECUTE ON FUNCTION app.insere_livre(), app.insere_forcada() TO app_user;
" >/dev/null

echo "### [M1] SECURITY DEFINER de dono NAO-superusuario x RLS"
probe 'dono_da_tabela_sem_BYPASSRLS' "SELECT rolsuper||'/'||rolbypassrls FROM pg_roles WHERE rolname='app_owner'"
psql_sql "GRANT INSERT, SELECT ON app.livre, app.forcada TO app_user;" >/dev/null
probe 'insert_direto_app_user_barrado_pela_POLICY' "SET ROLE app_user; INSERT INTO app.livre VALUES (9)"
probe 'definer_sem_FORCE_atravessa_RLS' "SET ROLE app_user; SELECT app.insere_livre()"
probe 'definer_com_FORCE_e_barrado' "SET ROLE app_user; SELECT app.insere_forcada()"
probe 'confirmacao_de_leitura' "SELECT 'livre='||(SELECT count(*) FROM app.livre)||' forcada='||(SELECT count(*) FROM app.forcada)"

echo "### [M2] CREATE OR REPLACE FUNCTION preserva a ACL"
psql_sql "
CREATE ROLE role_x NOLOGIN;
CREATE FUNCTION app.alvo() RETURNS int LANGUAGE sql AS 'SELECT 1';
REVOKE ALL ON FUNCTION app.alvo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.alvo() TO role_x;
" >/dev/null
probe 'acl_antes_do_replace' "SELECT COALESCE(array_to_string(proacl::text[],'|'),'<NULL>') FROM pg_proc WHERE proname='alvo'"
psql_sql "CREATE OR REPLACE FUNCTION app.alvo() RETURNS int LANGUAGE sql AS 'SELECT 2';" >/dev/null
probe 'acl_depois_do_replace' "SELECT COALESCE(array_to_string(proacl::text[],'|'),'<NULL>') FROM pg_proc WHERE proname='alvo'"
probe 'default_e_PUBLIC_EXECUTE' "
CREATE FUNCTION app.novo() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT COALESCE(array_to_string(proacl::text[],'|'),'<NULL=default>')||' anon_tem='||has_function_privilege('app_user','app.novo()','EXECUTE') FROM pg_proc WHERE proname='novo'"

echo "### [M3] gate por GUC estilo auth.role() - falha fechada?"
psql_sql "
CREATE FUNCTION app.gate() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=app AS \$f\$
BEGIN IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF; RETURN 'passou'; END \$f\$;
GRANT EXECUTE ON FUNCTION app.gate() TO app_user;
" >/dev/null
probe 'gate_guc_ausente' "SET ROLE app_user; SELECT app.gate()"
probe 'gate_guc_forjavel_pelo_chamador' "SET ROLE app_user; SET request.jwt.claim.role='service_role'; SELECT app.gate()"

printf 'HARNESS-END|mecanica\n'
