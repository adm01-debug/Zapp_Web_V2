#!/usr/bin/env bash
# L11 (docs/ia/IA-004-matriz-autorizacao.md:297): ACL de ESCRITA de public.departments.
#
# DEFEITO (medido no banco canonico em 01/10/2026): public.departments tem DUAS colunas de
# segredo (whatsapp_api_key, whatsapp_instance_id). A LEITURA ja tinha sido fechada por grant
# de coluna (20260902210000), mas o INSERT/UPDATE de NIVEL DE TABELA (privilegio default do
# schema public) nunca foi revogado -- e um REVOKE por coluna NAO remove grant de tabela.
# Efeito: qualquer usuario autenticado podia GRAVAR o segredo pelo PostgREST, sem passar pela
# RPC admin-only set_department_whatsapp_config.
#
# O SQL DA MIGRATION (20260930530000_l11_departments_acl_escrita.sql):
#   (1) REVOKE INSERT, UPDATE ON public.departments FROM authenticated;              -- TABELA
#   (2) REVOKE INSERT (whatsapp_api_key, whatsapp_instance_id),                      -- COLUNA
#              UPDATE (whatsapp_api_key, whatsapp_instance_id) ... FROM authenticated;
#   (3) GRANT INSERT (id, name, is_active, whatsapp_mode, created_at, updated_at) ...
#   (4) GRANT UPDATE (id, name, is_active, whatsapp_mode, created_at, updated_at) ...
#
# ESTE CONTRATO roda em PostgreSQL descartavel (docker), no formato dos testes irmaos
# scripts/db-audit/check-webhook-failures-acl.test.sh e
# scripts/db-audit/cron-secret-l5-contract.test.sh (bootstrap, container descartavel validado
# por regex antes do docker rm -f; conexao como o postgres da imagem; objetos qualificados
# public.*; o grant de TABELA reproduzido por ALTER DEFAULT PRIVILEGES, como no teste irmao).
# NENHUMA credencial de producao entra aqui.
#
# ESTADO ANTES reproduzido fielmente (o medido no banco canonico): authenticated tinha grant
# de TABELA INSERT/UPDATE/DELETE em departments E grants de COLUNA INSERT/UPDATE nas DUAS
# colunas de segredo; anon nao tinha nada; service_role mantem a escrita (a migration nao a
# toca).
#
# AS DUAS MUTACOES (cada uma em COPIA temporaria; o arquivo do repo NAO e editado):
#   MUTACAO A -- remove a linha (1) do REVOKE de TABELA -> o contrato FALHA (comprovado).
#   MUTACAO B -- remove a linha (2) do REVOKE de COLUNA -> ver ACHADO.
#
# ACHADO REGISTRADO (com evidencia medida no proprio PostgreSQL descartavel, e nao escondido):
# em PostgreSQL a doc do REVOKE e explicita -- "When revoking privileges on a table, the
# corresponding column privileges (if any) are automatically revoked on each column of the
# table, as well. On the other hand, if a role has been granted privileges on a table, then
# revoking the same privileges from individual columns will have no effect." (PG 17, REVOKE,
# Description). Isto tem duas consequencias que o teste mede:
#   * a linha (2) SOZINHA (sem a (1)) nunca fecharia nada -- e o defeito original do cabecalho;
#   * a linha (2) depois da (1) e REDUNDANTE: a (1) ja revoga, por CASCATA, os grants de COLUNA
#     de INSERT/UPDATE do MESMO grantor. Como (1) e (2) sao emitidos pelo mesmo papel, o
#     conjunto que (2) remove e sempre um subconjunto do que (1) remove -- logo remover a (2)
#     NAO reabre o furo, para QUALQUER estado alcancavel. A linha (1) e a load-bearing.
# Por isso a assercao MUTACAO B abaixo REGISTRA esse fato com evidencia, em vez de inventar um
# falso positivo; a sensibilidade do contrato ao REVOKE que realmente fecha o furo fica coberta
# por MUTACAO A. As leituras do SQL sao por AFIRMACAO (grep -F/-qE), NUNCA por contagem de
# texto -- comentario e string literal mudariam uma contagem e nao mudam uma afirmacao (a licao
# do supabase-usage-guard.mjs).
#
# Uso: bash scripts/db-audit/l11-departments-acl-escrita.test.sh
#      L11_DEPARTMENTS_ACL_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930530000_l11_departments_acl_escrita.sql"
postgres_image="${L11_DEPARTMENTS_ACL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-l11-departments-acl-test-$$"
# TMPDIR do ambiente de tarefa/CI pode apontar para um diretorio proprio; nunca /tmp por
# padrao da casa. mkdir -p garante o pai antes do primeiro uso.
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-l11-departments-acl-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-l11-departments-acl-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-l11-departments-acl-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

psql_db() {
  local db="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" -c "$sql"
}
psql_file_db() {
  local db="$1" file="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$file"
}

# ── Assercao de privilegio de COLUNA (criterio de aceite 2) ───────────────────────────────
# Normalizada por has_column_privilege -- a unica forma de medir o EFETIVO, que soma grant de
# TABELA (cobre todas as colunas) + grant de COLUNA. Imprime [OK]/[FAIL] por assercao.
assert_col_priv() { # db role col priv expected fase
  local db="$1" role="$2" col="$3" priv="$4" expected="$5" fase="$6" actual
  actual="$(psql_db "$db" "SELECT has_column_privilege('$role','public.departments','$col','$priv')")"
  if [[ "$actual" == "$expected" ]]; then
    printf '[OK] %s: has_column_privilege(%s, departments.%s, %s) = %s\n' \
      "$fase" "$role" "$col" "$priv" "$actual"
    return 0
  fi
  printf '[FAIL] %s: has_column_privilege(%s, departments.%s, %s) deveria ser %s, obtido %s\n' \
    "$fase" "$role" "$col" "$priv" "$expected" "$actual" >&2
  return 1
}

# Contrato completo do estado DEPOIS: segredos fechados para authenticated, colunas seguras
# abertas, anon sem nada, service_role inalterado. Retorna 1 na PRIMEIRA violacao.
checa_contrato() { # db fase
  local db="$1" fase="$2" col
  for col in whatsapp_api_key whatsapp_instance_id; do
    assert_col_priv "$db" authenticated "$col" INSERT f "$fase" || return 1
    assert_col_priv "$db" authenticated "$col" UPDATE f "$fase" || return 1
  done
  for col in id name is_active whatsapp_mode created_at updated_at; do
    assert_col_priv "$db" authenticated "$col" INSERT t "$fase" || return 1
    assert_col_priv "$db" authenticated "$col" UPDATE t "$fase" || return 1
  done
  for col in id name is_active whatsapp_mode whatsapp_api_key whatsapp_instance_id created_at updated_at; do
    assert_col_priv "$db" anon "$col" INSERT f "$fase" || return 1
    assert_col_priv "$db" anon "$col" UPDATE f "$fase" || return 1
  done
  assert_col_priv "$db" service_role whatsapp_api_key INSERT t "$fase" || return 1
  assert_col_priv "$db" service_role whatsapp_api_key UPDATE t "$fase" || return 1
  return 0
}

nova_base() { # db
  docker exec "$container_name" createdb -U postgres "$1" >/dev/null
  psql_file_db "$1" "$tmp_dir/antes.sql" >/dev/null
}

# Roda o contrato e exige que ele FALHE. A mensagem crua da assercao que falhou vira
# [EVIDENCIA] (nao pode sair como '[FAIL]' solto num log verde). Retorna 0 se FALHOU.
exige_falha_do_contrato() { # db fase
  local db="$1" fase="$2" evid
  evid="$( ( checa_contrato "$db" "$fase" ) 2>&1 || true )"
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

# O arquivo do repo tem as quatro linhas que a migration promete (afirmacao, nao contagem).
grep -qF 'REVOKE INSERT, UPDATE ON public.departments FROM authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de TABELA'
grep -qF 'REVOKE INSERT (whatsapp_api_key' "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de COLUNA das duas colunas de segredo'
grep -qF 'GRANT INSERT (id, name, is_active, whatsapp_mode, created_at, updated_at)' "$migration" ||
  fail 'o arquivo do repo perdeu o GRANT de INSERT das colunas seguras'
grep -qF 'GRANT UPDATE (id, name, is_active, whatsapp_mode, created_at, updated_at)' "$migration" ||
  fail 'o arquivo do repo perdeu o GRANT de UPDATE das colunas seguras'
ok 'o arquivo do repo tem os 2 REVOKE e os 2 GRANT de colunas seguras (o teste so le)'

mkdir -p "$tmp_dir"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=l11_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  logs="$(docker logs "$container_name" 2>&1 || true)"
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
    psql_db postgres 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# ── roles (cluster-global, criadas UMA vez) ───────────────────────────────────────────────
psql_db postgres '
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
' >/dev/null

# ── estado ANTES, fiel ao banco canonico (o grant de TABELA + os grants de COLUNA) ─────────
# O grant de TABELA e reproduzido pelo privilegio DEFAULT do schema public, exatamente como no
# teste irmao check-webhook-failures-acl.test.sh. anon NAO entra no default (medido: anon sem
# nada em departments).
cat > "$tmp_dir/antes.sql" <<'SQL'
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

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

-- grants de COLUNA medidos no banco canonico nas DUAS colunas de segredo.
GRANT INSERT (whatsapp_api_key, whatsapp_instance_id),
      UPDATE (whatsapp_api_key, whatsapp_instance_id) ON public.departments TO authenticated;
SQL

echo
echo '── ANTES: estado do banco canonico (o furo de escrita) ─────────────────────────────'
nova_base antes
for col in whatsapp_api_key whatsapp_instance_id; do
  for priv in INSERT UPDATE; do
    v="$(psql_db antes "SELECT has_column_privilege('authenticated','public.departments','$col','$priv')")"
    [[ "$v" == t ]] || fail "ANTES nao reproduziu o furo: authenticated.$col.$priv = $v (esperado t)"
    ok "ANTES: authenticated PODE $priv em departments.$col (furo reproduzido)"
  done
done
if exige_falha_do_contrato antes 'ANTES'; then
  ok 'ANTES: o contrato DETECTA o furo de escrita do segredo e encerraria nao-zero'
else
  fail 'ANTES: o contrato NAO acusou o furo (grant de TABELA + grants de COLUNA de segredo)'
fi

echo
echo '── DEPOIS: aplicando o SQL real da migration (criterio de aceite 2) ────────────────'
nova_base depois
psql_file_db depois "$migration" >/dev/null
checa_contrato depois 'DEPOIS' || fail 'DEPOIS: o contrato deveria passar com a migration aplicada'
ok 'DEPOIS: a migration fecha a escrita do segredo e preserva INSERT/UPDATE nas colunas seguras'

echo
echo '── MUTACAO A: removendo a linha do REVOKE de TABELA (copia temporaria) ─────────────'
mut_a="$tmp_dir/mut_a_sem_revoke_de_tabela.sql"
grep -v -F 'REVOKE INSERT, UPDATE ON public.departments FROM authenticated;' "$migration" > "$mut_a"
grep -qF 'REVOKE INSERT, UPDATE ON public.departments FROM authenticated;' "$mut_a" &&
  fail 'MUTACAO A: a copia ainda tem o REVOKE de TABELA'
grep -qF 'REVOKE INSERT (whatsapp_api_key' "$mut_a" ||
  fail 'MUTACAO A: a copia perdeu tambem o REVOKE de COLUNA (mutacao ampla demais)'
ok 'MUTACAO A: copia sem o REVOKE de TABELA (arquivo do repo intacto; copia em $tmp_dir)'
nova_base mut_a
psql_file_db mut_a "$mut_a" >/dev/null
if exige_falha_do_contrato mut_a 'MUTACAO A'; then
  ok 'MUTACAO A: sem o REVOKE de TABELA o contrato FALHA como esperado (o grant de tabela reabre o segredo)'
else
  fail 'MUTACAO A: sem o REVOKE de TABELA o contrato passou -- o vetor de nivel de TABELA nao esta coberto'
fi

echo
echo '── MUTACAO B: removendo a linha do REVOKE de COLUNA (copia temporaria) ─────────────'
mut_b="$tmp_dir/mut_b_sem_revoke_de_coluna.sql"
sed '/^REVOKE INSERT (whatsapp_api_key/,/FROM authenticated;$/d' "$migration" > "$mut_b"
grep -qF 'REVOKE INSERT (whatsapp_api_key' "$mut_b" &&
  fail 'MUTACAO B: a copia ainda tem o REVOKE de COLUNA'
grep -qF 'REVOKE INSERT, UPDATE ON public.departments FROM authenticated;' "$mut_b" ||
  fail 'MUTACAO B: a copia perdeu tambem o REVOKE de TABELA'
ok 'MUTACAO B: copia sem o REVOKE de COLUNA (arquivo do repo intacto; copia em $tmp_dir)'
nova_base mut_b
psql_file_db mut_b "$mut_b" >/dev/null
# Evidencia direta da CASCATA (a base da explicacao): apos a copia SEM o REVOKE de COLUNA, o
# REVOKE de TABELA sozinho ja deixou as duas colunas de segredo fechadas.
for col in whatsapp_api_key whatsapp_instance_id; do
  v="$(psql_db mut_b "SELECT has_column_privilege('authenticated','public.departments','$col','UPDATE')")"
  [[ "$v" == f ]] || fail "MUTACAO B: o REVOKE de TABELA nao fechou departments.$col (UPDATE=$v)"
done
if exige_falha_do_contrato mut_b 'MUTACAO B'; then
  ok 'MUTACAO B: sem o REVOKE de COLUNA o contrato FALHA como esperado'
else
  ok 'MUTACAO B (ACHADO, evidencia acima): sem o REVOKE de COLUNA o contrato SEGUE verde -- a linha e REDUNDANTE. O REVOKE de TABELA ja revoga, por cascata, os grants de COLUNA de INSERT/UPDATE do MESMO grantor (doc PG17 REVOKE: "the corresponding column privileges ... are automatically revoked"); remover a linha de COLUNA so poderia remover o que a linha de TABELA ja remove, entao NAO ha estado alcancavel em que essa mutacao reabra o furo.'
fi

echo
printf '[OK] contrato L11 (ACL de escrita de departments) verificado: %s asseracoes (%s)\n' \
  "$passed" "$postgres_image"
