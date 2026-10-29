#!/usr/bin/env bash
# O pg_isready pode responder durante o servidor temporário do entrypoint
# oficial, imediatamente antes de ele ser desligado. Aguarde o marcador da
# inicialização completa e uma consulta real no servidor final.
set -euo pipefail

container_name="${1:?informe o nome do contêiner PostgreSQL}"
attempts="${2:-60}"

for _ in $(seq 1 "$attempts"); do
  if docker logs "$container_name" 2>&1 \
      | grep -F 'PostgreSQL init process complete; ready for start up.' >/dev/null \
    && docker exec "$container_name" psql -X -qAt -U postgres -d postgres -c 'select 1' \
      >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

printf 'FAIL: PostgreSQL final não iniciou em %s segundos (%s)\n' "$attempts" "$container_name" >&2
exit 1
