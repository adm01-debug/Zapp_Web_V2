#!/usr/bin/env bash
# QA5-09 (cartao t_ed6b41cc): a tela de WhatsApp do departamento chamava, do
# NAVEGADOR, a RPC get_department_whatsapp_credentials — service_role-only no
# banco (REVOKE de PUBLIC, anon, authenticated em 20260928550000), entao o
# usuario logado levava 42501 e o modo salvo nunca carregava. E ela devolve a
# chave da API. A tela so precisa do MODO ('none' | 'evolution' | 'official').
#
# A correcao e a RPC NOVA e aditiva public.get_department_whatsapp_mode(uuid)
# -> text (migration 20261009170000_p1_department_whatsapp_mode.sql), com o
# mesmo portao de papel do irmao set_department_whatsapp_config (20260928540000,
# aqui endurecido para RAISE ... ERRCODE '42501') e ACL
#   REVOKE EXECUTE ... FROM PUBLIC, anon;
#   GRANT  EXECUTE ... TO authenticated;
#
# ESTE CONTRATO roda em PostgreSQL 17 descartavel (docker), no formato dos
# testes irmaos l11-departments-acl-escrita.test.sh (ANTES/DEPOIS + mutacoes em
# copia temporaria) e talkx-optout.test.sh (bootstrap de auth.uid(), roles,
# expect_error). UM banco so, so `docker run`/`docker exec ... psql`/`docker rm`:
# compativel com o docker-shim do db-guard.yml (E47), por isso o passo nao
# precisa de SKIP_DOCKER_SHIM. NENHUMA credencial de producao entra aqui.
#
#   ANTES  — reproduz o defeito medido: a funcao de credenciais da producao e
#            recriada EXATAMENTE como em 20260928550000 (jsonb com
#            whatsapp_api_key + REVOKE de PUBLIC/anon/authenticated) e prova-se
#            que `authenticated` nao tem EXECUTE e que a chamada morre com 42501.
#   DEPOIS — aplica o arquivo REAL da migration e prova: admin le 'evolution';
#            o retorno nunca contem a sentinela da chave; pg_get_function_result
#            = 'text'; authenticated tem EXECUTE, anon nao; chamada como anon e
#            como agente morrem com 42501; departamento inexistente -> NULL; e a
#            funcao de credenciais CONTINUA fechada (a migration nao concedeu
#            EXECUTE nela).
#   ESTATICO — o arquivo do repo tem o REVOKE e o GRANT (afirmacao grep -F,
#            nunca contagem) e NAO cita whatsapp_api_key/whatsapp_instance_id.
#   MUTACAO A — copia sem a linha do REVOKE: funcao recriada herda o EXECUTE de
#            PUBLIC -> anon passa a ler o modo -> o contrato FALHA.
#   MUTACAO B — copia com whatsapp_mode trocado por whatsapp_api_key no SELECT:
#            o admin recebe a sentinela -> o contrato FALHA (a chave vazou).
#
# Uso: bash scripts/db-audit/department-whatsapp-mode-rpc.test.sh
#      DEPARTMENT_WA_MODE_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009170000_p1_department_whatsapp_mode.sql"
postgres_image="${DEPARTMENT_WA_MODE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-dept-wa-mode-test-$$"
# TMPDIR da tarefa/CI pode apontar para diretorio proprio; nunca /tmp por padrao
# da casa. mkdir -p garante o pai antes do primeiro uso.
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-dept-wa-mode-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-dept-wa-mode-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-dept-wa-mode-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

# Um banco so (compativel com o docker-shim, que roteia todo -d para o banco do
# passo): -d postgres sob o docker real, -d shim_<nome> sob o shim.
psql_q() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

# Erro esperado de TOPO: qualquer desvio encerra o teste (exit 1).
expect_error() {
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o erro '$message'"; }
  ok "$label"
}

# Variantes usadas DENTRO do contrato: imprimem [FAIL] e retornam 1, sem sair —
# a mutacao precisa que o contrato FALHE, com a evidencia no log.
assert_eq() { # fase label esperado obtido
  local fase="$1" label="$2" expected="$3" actual="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '[OK] %s: %s = %s\n' "$fase" "$label" "$actual"
    return 0
  fi
  printf '[FAIL] %s: %s deveria ser %s, obtido %s\n' "$fase" "$label" "$expected" "$actual" >&2
  return 1
}
check_error() { # label mensagem sql
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '[FAIL] %s: a chamada passou (esperava erro %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  if [[ "$out" != *"$message"* ]]; then
    printf '[FAIL] %s: erro divergente (esperava %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  printf '[OK] %s\n' "$label"
  return 0
}

DEP_ID='50000000-0000-0000-0000-0000000000d1'
DEP_INEXISTENTE='50000000-0000-0000-0000-00000000ffff'
ADMIN_SUB='20000000-0000-0000-0000-0000000000a1'
AGENT_SUB='20000000-0000-0000-0000-0000000000a2'
SIG_MODE='public.get_department_whatsapp_mode(uuid)'
SIG_CRED='public.get_department_whatsapp_credentials(uuid)'
REVOKE_LINE='REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_mode(uuid) FROM PUBLIC, anon;'
GRANT_LINE='GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_mode(uuid) TO authenticated;'

admin_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
agent_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$AGENT_SUB';"
anon_call="BEGIN; SET LOCAL ROLE anon; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
noauth_call="BEGIN; SET LOCAL ROLE authenticated;"

# O contrato DEPOIS completo: devolve 0 se TODAS as assercoes passam, 1 na
# primeira violacao (a saida com [FAIL] vira evidencia nas mutacoes).
checa_contrato() { # fase
  local fase="$1" result
  result="$(psql_q -c "$admin_call SELECT public.get_department_whatsapp_mode('$DEP_ID'); COMMIT;")" \
    || { printf '[FAIL] %s: a chamada admin nao devolveu o modo\n' "$fase" >&2; return 1; }
  assert_eq "$fase" 'admin le o modo' 'evolution' "$result" || return 1
  if [[ "$result" == 'CHAVE-SENTINELA-NUNCA-EXPOSTA' || "$result" == *'CHAVE-SENTINELA'* ]]; then
    printf '[FAIL] %s: o retorno contem a sentinela da chave: %s\n' "$fase" "$result" >&2
    return 1
  fi
  printf '[OK] %s: o retorno nao contem a sentinela da chave\n' "$fase"
  assert_eq "$fase" "pg_get_function_result($SIG_MODE)" 'text' \
    "$(psql_q -c "SELECT pg_get_function_result('$SIG_MODE'::regprocedure)")" || return 1
  assert_eq "$fase" "has_function_privilege(authenticated, $SIG_MODE, EXECUTE)" 't' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_MODE','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(anon, $SIG_MODE, EXECUTE)" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('anon','$SIG_MODE','EXECUTE')")" || return 1
  check_error "$fase: anon e barrado (42501)" '42501' \
    "$anon_call SELECT public.get_department_whatsapp_mode('$DEP_ID'); COMMIT;" || return 1
  check_error "$fase: agente e barrado pelo portao de papel (42501)" '42501' \
    "$agent_call SELECT public.get_department_whatsapp_mode('$DEP_ID'); COMMIT;" || return 1
  check_error "$fase: sem profile/JWT e barrado (42501)" '42501' \
    "$noauth_call SELECT public.get_department_whatsapp_mode('$DEP_ID'); COMMIT;" || return 1
  assert_eq "$fase" 'departamento inexistente devolve NULL' '<null>' \
    "$(psql_q -c "$admin_call SELECT coalesce(public.get_department_whatsapp_mode('$DEP_INEXISTENTE'), '<null>'); COMMIT;")" || return 1
  assert_eq "$fase" "has_function_privilege(authenticated, $SIG_CRED, EXECUTE) segue f" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_CRED','EXECUTE')")" || return 1
  return 0
}

# Roda o contrato e exige que ele FALHE. A mensagem crua da assercao que falhou
# vira [EVIDENCIA] (nao pode sair como '[FAIL]' solto num log verde).
exige_falha_do_contrato() { # fase
  local fase="$1" evid
  evid="$( ( checa_contrato "$fase" ) 2>&1 || true )"
  if [[ "$evid" == *'[FAIL]'* ]]; then
    printf '%s\n' "$evid" | sed 's/^/[EVIDENCIA] /'
    return 0
  fi
  printf '%s\n' "$evid" >&2
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

# ── leitura estatica do arquivo do repo (afirmacao grep -F, nunca contagem) ───
grep -qF "$REVOKE_LINE" "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de PUBLIC, anon'
grep -qF "$GRANT_LINE" "$migration" ||
  fail 'o arquivo do repo perdeu o GRANT para authenticated'
grep -qF 'CREATE OR REPLACE FUNCTION public.get_department_whatsapp_mode(p_department_id uuid)' "$migration" ||
  fail 'o arquivo do repo perdeu o CREATE OR REPLACE da RPC de modo'
grep -qF 'RETURNS text' "$migration" ||
  fail 'o arquivo do repo perdeu o RETURNS text (prova estrutural: sem campo de chave)'
if grep -qF 'whatsapp_api_key' "$migration"; then
  fail 'o arquivo do repo cita whatsapp_api_key — a RPC de modo nao pode tocar a chave'
fi
if grep -qF 'whatsapp_instance_id' "$migration"; then
  fail 'o arquivo do repo cita whatsapp_instance_id — a RPC de modo nao pode tocar a instancia'
fi
ok 'o arquivo do repo tem REVOKE/GRANT, RETURNS text e nao cita as colunas de segredo (o teste so le)'

mkdir -p "$tmp_dir"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=qa5_09_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if psql_q -c 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || { printf 'FAIL: PostgreSQL de teste não iniciou\n' >&2; exit 1; }

# ── bootstrap: schema minimo + seeds + a funcao de credenciais da producao ────
# A funcao de credenciais e recriada EXATAMENTE como a migration 20260928550000
# a registrou no ledger (jsonb com a chave + REVOKE de PUBLIC/anon/authenticated
# + GRANT so para service_role) — e o estado que a tela vivia.
cat > "$tmp_dir/bootstrap.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_mode text,
  whatsapp_api_key text,
  whatsapp_instance_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

INSERT INTO public.departments (id, name, whatsapp_mode, whatsapp_api_key, whatsapp_instance_id)
VALUES ('50000000-0000-0000-0000-0000000000d1', 'Departamento QA5-09', 'evolution',
        'CHAVE-SENTINELA-NUNCA-EXPOSTA', 'inst-sentinela-1');

INSERT INTO public.profiles (id, user_id, role) VALUES
  ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('10000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', 'agent');

-- Funcao de credenciais de producao, identica a 20260928550000.
CREATE FUNCTION public.get_department_whatsapp_credentials(p_department_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_row public.departments%ROWTYPE; BEGIN IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN RAISE EXCEPTION 'access_denied'; END IF; SELECT * INTO v_row FROM public.departments WHERE id = p_department_id; IF NOT FOUND THEN RETURN NULL; END IF; RETURN jsonb_build_object('whatsapp_mode', v_row.whatsapp_mode, 'whatsapp_api_key', v_row.whatsapp_api_key, 'whatsapp_instance_id', v_row.whatsapp_instance_id); END; $f$;

REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) TO service_role;
SQL

psql_file "$tmp_dir/bootstrap.sql" >/dev/null
ok 'bootstrap: roles, auth.uid(), profiles, departments e a funcao de credenciais da producao'

echo
echo '── ANTES: o defeito que a tela vivia (credenciais negadas ao usuario logado) ──'
v="$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_CRED','EXECUTE')")"
[[ "$v" == f ]] || fail "ANTES nao reproduziu o defeito: authenticated EXECUTE na RPC de credenciais = $v"
ok "ANTES: has_function_privilege(authenticated, $SIG_CRED, EXECUTE) = f"
expect_error 'ANTES: a chamada do navegador morre com 42501 (permission denied for function)' \
  '42501' "$admin_call SELECT public.get_department_whatsapp_credentials('$DEP_ID'); COMMIT;"

echo
echo '── DEPOIS: aplicando o SQL real da migration ─────────────────────────────'
psql_file "$migration" >/dev/null
if ! checa_contrato 'DEPOIS'; then
  fail 'DEPOIS: o contrato deveria passar com a migration aplicada'
fi
ok 'DEPOIS: o contrato inteiro passa com a migration aplicada'

echo
echo '── MUTACAO A: copia sem o REVOKE de PUBLIC, anon (arquivo do repo intacto) ──'
mut_a="$tmp_dir/mut_a_sem_revoke.sql"
grep -v -F "$REVOKE_LINE" "$migration" > "$mut_a"
grep -qF "$REVOKE_LINE" "$mut_a" && fail 'MUTACAO A: a copia ainda tem o REVOKE'
grep -qF "$GRANT_LINE" "$mut_a" || fail 'MUTACAO A: a copia perdeu tambem o GRANT (mutacao ampla demais)'
grep -qF "$REVOKE_LINE" "$migration" || fail 'MUTACAO A: o arquivo do repo foi alterado'
ok 'MUTACAO A: copia sem o REVOKE de PUBLIC, anon (copia em TMPDIR da tarefa)'
# Funcao recriada do zero herda o EXECUTE de PUBLIC: sem a linha do REVOKE, o
# privilegio default fica aberto para anon.
psql_q -c "DROP FUNCTION public.get_department_whatsapp_mode(uuid)" >/dev/null
psql_file "$mut_a" >/dev/null
if exige_falha_do_contrato 'MUTACAO A'; then
  ok 'MUTACAO A: sem o REVOKE o contrato FALHA como esperado (anon passa a ler o modo)'
else
  fail 'MUTACAO A: sem o REVOKE o contrato passou -- a abertura para anon nao esta coberta'
fi

echo
echo '── MUTACAO B: copia com whatsapp_api_key no SELECT (arquivo do repo intacto) ──'
mut_b="$tmp_dir/mut_b_select_chave.sql"
sed 's/SELECT whatsapp_mode INTO v_mode/SELECT whatsapp_api_key INTO v_mode/' "$migration" > "$mut_b"
grep -qF 'SELECT whatsapp_api_key INTO v_mode' "$mut_b" ||
  fail 'MUTACAO B: a copia nao aplicou a troca do SELECT'
grep -qF 'SELECT whatsapp_mode INTO v_mode' "$mut_b" &&
  fail 'MUTACAO B: a copia ainda le whatsapp_mode'
grep -qF 'SELECT whatsapp_mode INTO v_mode' "$migration" ||
  fail 'MUTACAO B: o arquivo do repo foi alterado'
ok 'MUTACAO B: copia lendo a coluna da chave (copia em TMPDIR da tarefa)'
psql_q -c "DROP FUNCTION public.get_department_whatsapp_mode(uuid)" >/dev/null
psql_file "$mut_b" >/dev/null
if exige_falha_do_contrato 'MUTACAO B'; then
  ok 'MUTACAO B: lendo a coluna da chave o contrato FALHA como esperado (a sentinela vazou)'
else
  fail 'MUTACAO B: devolvendo a chave o contrato passou -- a prova "nunca a chave" nao esta coberta'
fi

echo
echo '── PORTAO DE PAPEL: profile ausente (deny-by-default) ─────────────────────'
# current_profile_id() passa a devolver um id SEM linha em profiles (v_is_admin fica
# NULL). O `IS NOT TRUE` da migration TEM de recusar; o `NOT NULL` do irmao deixaria
# passar (fail-open). Stub local, so neste banco descartavel.
psql_file "$migration" >/dev/null   # restaura a funcao REAL depois da MUTACAO B
cat > "$tmp_dir/stub_profile_ausente.sql" <<'SQL'
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT '10000000-0000-0000-0000-0000000000ff'::uuid
$$;
SQL
psql_file "$tmp_dir/stub_profile_ausente.sql" >/dev/null
if check_error 'profile ausente e barrado (42501, deny-by-default)' '42501' \
  "$admin_call SELECT public.get_department_whatsapp_mode('$DEP_ID'); COMMIT;"; then
  ok 'profile ausente: o portao recusa (IS NOT TRUE) em vez de deixar passar'
else
  fail 'profile ausente: o portao deixou passar -- fail-open no v_is_admin NULL'
fi

echo
printf '[OK] contrato QA5-09 (RPC de modo do WhatsApp do departamento) verificado: %s assercoes (%s)\n' \
  "$passed" "$postgres_image"
