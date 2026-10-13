#!/usr/bin/env bash
# t_fceba6d5 — runner genérico para as suítes SQL AUTO-CONTIDAS de supabase/tests/.
#
# Contexto: as suítes de supabase/tests/*.sql eram órfãs — existiam no disco e
# nenhum passo do CI as executava. As auto-contidas criam a própria superfície
# mínima (roles anon/authenticated/service_role, schema auth, tabelas) e rodam
# inteiras dentro de uma transação que termina em ROLLBACK, montando o repo
# somente-leitura; por isso rodam contra um PostgreSQL 17 DESCARTÁVEL, e não
# contra o banco da tarefa (onde as roles/tabelas já existem).
#
# Espelha o "COMO RODA" que cada suíte documenta no próprio cabeçalho:
#   docker run --rm -d --name <n> -e POSTGRES_PASSWORD=test_only \
#     -v "$PWD:/repo:ro" postgres:17-alpine
#   docker exec -w /repo -i <n> psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
#     < supabase/tests/<suíte>.sql
#
# Sucesso ./ Falha: cada suíte é aprovada por (a) exit 0 do psql com
# ON_ERROR_STOP=1 — o helper de asserção da suíte levanta EXCEPTION e derruba a
# transação — e (b) ausência de um marcador `FAIL` no log. O runner sai NÃO-ZERO
# se QUALQUER suíte falhar.
#
# Variáveis:
#   SUITES_POSTGRES_IMAGE   imagem do PostgreSQL descartável (default postgres:17-alpine;
#                           o workflow injeta $POSTGRES_TEST_IMAGE, pinada por digest)
#   SUITES_PSQL_VARS        opções `-v nome=valor` extras repassadas ao psql (ex.: mutação
#                           `-v sem_migration=1` para provar que o runner pega a falha)
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  printf 'usage: %s <suite.sql> [suite.sql ...]\n' "${0##*/}" >&2
  exit 64
fi

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGEM="${SUITES_POSTGRES_IMAGE:-postgres:17-alpine}"
NOME="zapp-v2-suites-$$-${RANDOM}"
read -r -a PSQL_VARS <<< "${SUITES_PSQL_VARS:-}"

docker rm -f "$NOME" >/dev/null 2>&1 || true
docker run --rm -d --name "$NOME" \
  -e POSTGRES_PASSWORD=test_only \
  -v "$RAIZ:/repo:ro" \
  "$IMAGEM" >/dev/null
# Rótulo de posse: o trap só remove container criado por este run (nome único por $$+RANDOM).
trap 'docker rm -f "$NOME" >/dev/null 2>&1 || true' EXIT

pronto=0
for _ in $(seq 1 "${SUITES_READY_TENTATIVAS:-60}"); do
  if docker exec "$NOME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    pronto=1
    break
  fi
  sleep 1
done
if [[ "$pronto" -ne 1 ]]; then
  echo "FAIL: PostgreSQL de teste não iniciou (container $NOME)" >&2
  exit 1
fi

falhou=0
for suite in "$@"; do
  echo "── suíte: $suite"
  log="$(docker exec -w /repo -i "$NOME" \
    psql -X -q -v ON_ERROR_STOP=1 "${PSQL_VARS[@]}" -U postgres -d postgres < "$RAIZ/$suite" 2>&1)" && rc=0 || rc=$?
  printf '%s\n' "$log"
  if [[ "$rc" -ne 0 ]]; then
    echo "SUITE FALHOU (exit $rc): $suite" >&2
    falhou=1
  elif printf '%s\n' "$log" | grep -qE '(^|[^A-Za-z0-9_])FAIL([^A-Za-z0-9_]|$)'; then
    echo "SUITE FALHOU (marcador FAIL no log): $suite" >&2
    falhou=1
  fi
done

if [[ "$falhou" -ne 0 ]]; then
  echo "run-suites-postgres: FALHOU" >&2
else
  echo "run-suites-postgres: OK ($# suíte(s))"
fi
exit "$falhou"
