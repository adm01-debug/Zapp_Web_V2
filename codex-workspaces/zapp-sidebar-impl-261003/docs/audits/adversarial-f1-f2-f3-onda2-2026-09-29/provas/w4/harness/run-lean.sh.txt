#!/usr/bin/env bash
# =============================================================================
# W4 (onda 2) -- RUNNER REDUZIDO, por volume, para caber em UMA invocacao curta.
#
#   run-lean.sh <volume> <base|idx> [container]
#
# `base` : banco novo (schema + funcoes + indices do canonico + seed) e as fases
#          de baseline do volume.
# `idx`  : reusa o banco deixado por `base` no MESMO container; cria os indices
#          propostos (com timing de DDL), roda as fases de correcao, mede custo
#          dos indices, trigger e concorrencia.
#
# NUNCA apaga a pasta de evidencias: cada arquivo e sobrescrito individualmente,
# e os CSVs saem com sufixo proprio (-base-/-idx-) para nao perder o anterior.
# =============================================================================
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
d="$repo_root/scripts/db-audit/w4-perf"
ev="$repo_root/docs/audits/w4-performance-2026-09-29/evidence"
mkdir -p "$ev"

VOL="${1:?volume (3000|10000|100000)}"
MODE="${2:?modo (base|idx)}"
CT="${3:-zapp-w4-lean}"
IMAGE="${W4_PG_IMAGE:-postgres:17}"
RUNS="${W4_RUNS:-6}"
uid_agent="11111111-0000-4000-8000-000000000001"
uid_admin="99999999-0000-4000-8000-000000000001"

log() { printf '\n=== [%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

PSQL=(docker exec -i "$CT" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d w4)

boot() {
  if ! docker inspect "$CT" >/dev/null 2>&1; then
    log "subindo container $CT ($IMAGE)"
    docker run -d --name "$CT" \
      -e POSTGRES_PASSWORD=w4 -e POSTGRES_DB=w4 \
      "$IMAGE" \
      -c shared_buffers=1GB -c work_mem=64MB -c max_connections=60 \
      -c track_io_timing=on -c log_lock_waits=on >/dev/null
    for _ in $(seq 1 60); do
      docker exec "$CT" pg_isready -U postgres -d w4 >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  docker exec "$CT" pg_isready -U postgres -d w4 >/dev/null
  # extensoes necessarias (pg_trgm) vivem no template; criar em w4 se faltar
  docker exec "$CT" psql -X -q -U postgres -d w4 -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm' >/dev/null
}

fresh_db() {
  docker exec "$CT" psql -X -q -U postgres -d postgres \
    -c 'DROP DATABASE IF EXISTS w4' -c 'CREATE DATABASE w4' >/dev/null
}

phase() {  # phase <out> <nome_fase> <variante> <matriz> <caller> <uid> [offs] [extras]
  local out="$1" name="$2" variant="$3" matrix="$4" caller="$5" uid="$6"
  local offs="${7:-0,500}" extras="${8:-1}"
  "${PSQL[@]}" -v phase="$name" -v variant="$variant" -v matrix="$matrix" \
      -v caller="$caller" -v uid="$uid" -v runs="$RUNS" \
      -v offs="$offs" -v extras="$extras" \
      < "$d/07-bench.sql" > "$ev/$out" 2>&1
  printf '  %-44s ok\n' "$out"
}

phase_once() {  # phase_once <out> ... : nao repete uma fase cujo .txt ja existe
  local out="$1"
  if [ -s "$ev/$out" ]; then printf '  %-44s (ja existe, pulado)\n' "$out"; return 0; fi
  phase "$@"
}

dump() {  # dump <sql> <arquivo>
  docker exec -i "$CT" psql -X -q -U postgres -d w4 -c \
    "\\copy ($1) TO STDOUT CSV HEADER" > "$ev/$2" 2>/dev/null
  printf '  csv %-40s %s linhas\n' "$2" "$(( $(wc -l < "$ev/$2") - 1 ))"
}

case "$VOL:$MODE" in

# --------------------------------------------------------------------------
3000:base|10000:base)
  log "VOLUME $VOL / modo base"
  boot; fresh_db
  for f in 00-schema.sql generated/02-functions.sql 03-baseline-indexes.sql \
           06-rpc-variants.sql; do
    "${PSQL[@]}" < "$d/$f" >/dev/null
  done
  log "VOLUME $VOL / seed"
  "${PSQL[@]}" -v n="$VOL" < "$d/04-seed.sql" > "$ev/seed-$VOL.txt" 2>&1
  "${PSQL[@]}" -v uid="$uid_agent" < "$d/08-equivalencia.sql" > "$ev/equivalencia-$VOL.txt" 2>&1
  phase "fase1-v0-baseline-core-extra-$VOL.txt" f1_v0_base v0 all      agent "$uid_agent"
  phase "fase1-v1-inline-core-$VOL.txt"         f1_v1_inline v1 core    agent "$uid_agent"
  phase "fase1-v2-branches-core-$VOL.txt"       f1_v2_branch v2 core    agent "$uid_agent"
  phase "fase1-v0-admin-mini-$VOL.txt"          f1_v0_admin  v0 mini    admin "$uid_admin"
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-$VOL.csv"
  ;;

# --------------------------------------------------------------------------
100000:base|30000:base)
  log "VOLUME $VOL / modo base"
  if [ "${W4_REUSE_DB:-0}" = "1" ]; then
    # Reusa o banco ja semeado neste container e devolve a tabela ao estado
    # CANONICO de indices: mede o "antes" sem re-semear e sem os indices novos.
    boot
    "${PSQL[@]}" -c 'TRUNCATE w4_bench' < /dev/null
    "${PSQL[@]}" < "$d/18-drop-propostos.sql" >/dev/null
    "${PSQL[@]}" -c 'ANALYZE public.contacts' < /dev/null
  else
    boot; fresh_db
    for f in 00-schema.sql generated/02-functions.sql 03-baseline-indexes.sql \
             06-rpc-variants.sql; do
      "${PSQL[@]}" < "$d/$f" >/dev/null
    done
    log "VOLUME $VOL / seed (o passo mais lento desta invocacao)"
    "${PSQL[@]}" -v n="$VOL" < "$d/04-seed.sql" > "$ev/seed-$VOL.txt" 2>&1
    "${PSQL[@]}" -v uid="$uid_agent" < "$d/08-equivalencia.sql" > "$ev/equivalencia-$VOL.txt" 2>&1
  fi
  # amostra reduzida mas obrigatoria: 3 piores (sem_filtro/termo) e o melhor
  # (combinado), nos 6 sorts, com offset 0 E 500 (paginacao).
  phase "fase1-v0-foco-$VOL.txt"      f1_v0_base  v0 foco  agent "$uid_agent" 0,500 1
  phase "fase1-v1-foco0-$VOL.txt"     f1_v1_inline v1 foco0 agent "$uid_agent" 0 0
  phase "fase1-v2-foco0-$VOL.txt"     f1_v2_branch v2 foco0 agent "$uid_agent" 0 0
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-$VOL.csv"
  ;;

# --------------------------------------------------------------------------
3000:idx|10000:idx)
  log "VOLUME $VOL / modo idx (reusa $CT)"
  boot
  if [ "${W4_FRESH:-0}" = "1" ]; then
    log "VOLUME $VOL / banco novo + seed"
    fresh_db
    for f in 00-schema.sql generated/02-functions.sql 03-baseline-indexes.sql \
             06-rpc-variants.sql; do
      "${PSQL[@]}" < "$d/$f" >/dev/null
    done
    "${PSQL[@]}" -v n="$VOL" < "$d/04-seed.sql" > "$ev/seed-$VOL.txt" 2>&1
  fi
  for f in 11-idx1-parcial.sql 12-idx2-completo.sql 13-idx3-ordenacao.sql; do
    log "VOLUME $VOL / $f"
    { echo "# $f"; "${PSQL[@]}" < "$d/$f"; } > "$ev/${f%%-*}-ddl-$VOL.txt" 2>&1
    grep -E '^(Time|NOTICE)' "$ev/${f%%-*}-ddl-$VOL.txt" || true
    case "$f" in
      11-*) phase_once "fase2-v0-idx1-mini-$VOL.txt" f2_v0_idx1 v0 mini agent "$uid_agent" ;;
      12-*) phase_once "fase3-v0-idx2-core-$VOL.txt" f3_v0_idx2 v0 core agent "$uid_agent" ;;
      13-*) phase_once "fase4-v0-idx3-mini-$VOL.txt" f4_v0_idx3 v0 mini agent "$uid_agent"
            phase_once "fase4-v2-idx3-mini-$VOL.txt" f4_v2_idx3 v2 mini agent "$uid_agent"
            phase_once "fase4-v3-idx3-core-$VOL.txt" f4_v3_idx3 v3 core agent "$uid_agent" ;;
    esac
  done
  "${PSQL[@]}" -v vol="$VOL" < "$d/14-index-cost.sql" > "$ev/index-cost-$VOL.txt" 2>&1
  dump "SELECT indice, pg_relation_size(oid) AS bytes_indice, idx_scan AS scans,
               pg_get_indexdef(oid) AS ddl
          FROM pg_stat_user_indexes JOIN pg_class USING (oid)
         WHERE relname = 'contacts'" "indexes-$VOL.csv"
  log "VOLUME $VOL / trigger de auditoria"
  "${PSQL[@]}" -v vol="$VOL" -v big=3000 -v reps=8 -v uid="$uid_agent" < "$d/15-trigger-bench.sql" \
      > "$ev/trigger-$VOL.txt" 2>&1
  dump "SELECT * FROM w4_trig" "trig-$VOL.csv"
  log "VOLUME $VOL / concorrencia (10 sessoes, mesma linha)"
  bash "$d/16-concorrencia.sh" "$CT" "$uid_agent" 10 400 > "$ev/concorrencia-$VOL.txt" 2>&1
  grep -E 'CASO|PICO|MEDIA|MAX_UPDATE' "$ev/concorrencia-$VOL.txt" || true
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-idx-$VOL.csv"
  ;;

# --------------------------------------------------------------------------
100000:idx|30000:idx)
  log "VOLUME $VOL / modo idx (reusa $CT)"
  boot
  for f in 11-idx1-parcial.sql 12-idx2-completo.sql 13-idx3-ordenacao.sql; do
    log "VOLUME $VOL / $f"
    { echo "# $f"; "${PSQL[@]}" < "$d/$f"; } > "$ev/${f%%-*}-ddl-$VOL.txt" 2>&1
    grep -E '^(Time|NOTICE)' "$ev/${f%%-*}-ddl-$VOL.txt" || true
    case "$f" in
      11-*) phase "fase2-v0-idx1-foco-$VOL.txt" f2_v0_idx1 v0 foco agent "$uid_agent" 0,500 0 ;;
      12-*) phase "fase3-v0-idx2-foco-$VOL.txt" f3_v0_idx2 v0 foco agent "$uid_agent" 0,500 0 ;;
      13-*) phase "fase4-v0-idx3-foco-$VOL.txt" f4_v0_idx3 v0 foco agent "$uid_agent" 0,500 0
            phase "fase4-v2-idx3-foco0-$VOL.txt" f4_v2_idx3 v2 foco0 agent "$uid_agent" 0 0
            phase "fase4-v3-idx3-foco-$VOL.txt" f4_v3_idx3 v3 foco agent "$uid_agent" 0,500 0 ;;
    esac
  done
  "${PSQL[@]}" -v vol="$VOL" < "$d/14-index-cost.sql" > "$ev/index-cost-$VOL.txt" 2>&1
  dump "SELECT indexrelname AS indice, pg_relation_size(indexrelid) AS bytes_indice,
               idx_scan AS scans, pg_get_indexdef(indexrelid) AS ddl
          FROM pg_stat_user_indexes WHERE relname = 'contacts'" "indexes-$VOL.csv"
  log "VOLUME $VOL / trigger de auditoria (lote 3000, pareado)"
  "${PSQL[@]}" -v vol="$VOL" -v big=3000 -v reps=8 -v uid="$uid_agent" < "$d/15-trigger-bench.sql" \
      > "$ev/trigger-$VOL.txt" 2>&1
  dump "SELECT * FROM w4_trig" "trig-$VOL.csv"
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-idx-$VOL.csv"
  ;;

# --------------------------------------------------------------------------
# `finish`: fechar um volume cujas fases ficaram pela metade (o `timeout` da
# invocacao anterior cortou antes dos dumps). O estado ja esta no container:
# os indices propostos existem e `w4_bench` guarda as fases ja medidas.
10000:finish|100000:finish|30000:finish)
  log "VOLUME $VOL / modo finish (reusa $CT)"
  boot
  phase "fase4-v3-idx3-core-$VOL.txt" f4_v3_idx3 v3 core agent "$uid_agent" 0,500 0
  "${PSQL[@]}" -v vol="$VOL" < "$d/14-index-cost.sql" > "$ev/index-cost-$VOL.txt" 2>&1
  dump "SELECT indice, pg_relation_size(oid) AS bytes_indice, idx_scan AS scans,
               pg_get_indexdef(oid) AS ddl
          FROM pg_stat_user_indexes JOIN pg_class USING (oid)
         WHERE relname = 'contacts'" "indexes-$VOL.csv"
  log "VOLUME $VOL / trigger de auditoria (lote 3000, pareado)"
  "${PSQL[@]}" -v vol="$VOL" -v big=3000 -v reps=8 -v uid="$uid_agent" < "$d/15-trigger-bench.sql" \
      > "$ev/trigger-$VOL.txt" 2>&1
  dump "SELECT * FROM w4_trig" "trig-$VOL.csv"
  log "VOLUME $VOL / concorrencia (10 sessoes, mesma linha)"
  bash "$d/16-concorrencia.sh" "$CT" "$uid_agent" 10 400 > "$ev/concorrencia-$VOL.txt" 2>&1
  grep -E 'CASO|PICO|MEDIA|MAX_UPDATE' "$ev/concorrencia-$VOL.txt" || true
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-idx-$VOL.csv"
  ;;

*)
  printf 'combinacao nao suportada: %s %s\n' "$VOL" "$MODE" >&2; exit 2 ;;
esac

log "VOLUME $VOL / modo $MODE concluido"
