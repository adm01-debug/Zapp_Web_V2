#!/usr/bin/env bash
# Auditar W4-5 / SL-044: a contagem da lista de contatos ainda e EXATA (count(*) OVER())
# em search_contacts na ponta de 2026-10-08, e quanto custa em 30k e 100k contatos.
#
# Roda SO em PostgreSQL descartavel (docker). Nunca no banco real, nunca na stack de outro
# cartao. Aplica a migration REAL 20260930450000 (baixada da branch dia/2026-10-08) sobre um
# esqueleto minimo derivado das migrations reais (00-schema.sql).
#
#   bash run-bench.sh 30000 admin 6
#   bash run-bench.sh 100000 admin 6
#   bash run-bench.sh 100000 agent 6
set -Eeuo pipefail

vol="${1:?volume}"
caller="${2:?admin|agent}"
runs="${3:-6}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
container="zapp-sl044-audit-$$"
image="${SL044_PG_IMAGE:-postgres:17}"

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

boot() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker run -d --name "$container" \
    -e POSTGRES_PASSWORD=w4 -e POSTGRES_DB=w4 \
    "$image" -c shared_buffers=1GB -c work_mem=64MB >/dev/null
  local i
  for i in $(seq 1 60); do
    if docker exec "$container" pg_isready -U postgres -d w4 >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "postgres nao subiu" >&2
  return 1
}

psqlf() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d w4 "$@"; }

echo "### container=$container imagem=$image volume=$vol caller=$caller runs=$runs"
boot

echo "### [1/5] esqueleto minimo (00-schema.sql)"
psqlf -f - < "$here/00-schema.sql" >/dev/null

echo "### [2/5] migration REAL 02-canonical-20260930450000.sql (sha256 abaixo)"
sha256sum "$here/02-canonical-20260930450000.sql"
psqlf -f - < "$here/02-canonical-20260930450000.sql" >/dev/null

echo "### [3/5] seed :vol=$vol caller=$caller"
psqlf -v vol="$vol" -v caller="$caller" -f - < "$here/03-seed.sql"

echo "### [4/5] versao do Postgres e definicao vigente de search_contacts"
psqlf -At -c "select version();"
psqlf -At -c "select p.oid::regprocedure, p.prosecdef from pg_proc p where p.proname = 'search_contacts';"
psqlf -At -c "select 'COUNT(*) OVER() presente: ' || (position('COUNT(*) OVER ()' in pg_get_functiondef('public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer,boolean)'::regprocedure)) > 0);"

echo "### [5/5] medicao"
psqlf -v vol="$vol" -v caller="$caller" -v runs="$runs" -f - < "$here/04-bench.sql"

echo "### fim"
