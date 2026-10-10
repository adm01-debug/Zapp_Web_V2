#!/usr/bin/env bash
# =============================================================================
# W4 (onda 2) -- experimento de performance do `search_contacts` + overhead do
# trigger de auditoria. Roda SO em PostgreSQL descartavel (docker), nunca no
# banco canonico.
#
#   bash scripts/db-audit/retry-disposable-postgres-test.sh \
#        bash scripts/db-audit/w4-search-contacts-perf.test.sh
#
# Saida: docs/audits/w4-performance-2026-09-29/evidence/*.txt (saidas literais)
#        docs/audits/w4-performance-2026-09-29/evidence/bench-<vol>.csv
#        docs/audits/w4-performance-2026-09-29/evidence/trig-<vol>.csv
#
# Tempo de parede: ~30 min (o volume de 100.000 domina).
# =============================================================================
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
d="$repo_root/scripts/db-audit/w4-perf"
ev="$repo_root/docs/audits/w4-performance-2026-09-29/evidence"
container="zapp-w4-perf-$$"
image="${W4_PG_IMAGE:-postgres:17}"
uid_agent='11111111-0000-4000-8000-000000000001'
uid_admin='99999999-0000-4000-8000-000000000001'
volumes=(${W4_VOLUMES:-3000 10000 100000})
runs="${W4_RUNS:-6}"

mkdir -p "$ev"
PSQL=(docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d w4)

cleanup() {
  if [[ "$container" =~ ^zapp-w4-perf-[0-9]+$ ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

log() { printf '\n=== [%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

boot() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker run -d --name "$container" \
    -e POSTGRES_PASSWORD=w4 -e POSTGRES_DB=w4 \
    "$image" \
    -c shared_buffers=1GB -c work_mem=64MB -c max_connections=60 \
    -c track_io_timing=on -c log_lock_waits=off >/dev/null
  local i
  for i in $(seq 1 60); do
    if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete; ready for start up.' &&
       docker exec "$container" psql -X -At -q -U postgres -d w4 -c 'SELECT 1' >/dev/null 2>&1; then
      printf 'PostgreSQL descartavel pronto (%s, %ss)\n' "$image" "$i"
      return 0
    fi
    sleep 1
  done
  printf 'FAIL: PostgreSQL de teste nao iniciou\n' >&2
  return 1
}

fresh_db() {
  docker exec "$container" psql -X -q -U postgres -d postgres -c 'DROP DATABASE IF EXISTS w4' >/dev/null
  docker exec "$container" psql -X -q -U postgres -d postgres -c 'CREATE DATABASE w4' >/dev/null
}

apply_sql() { "${PSQL[@]}" -q < "$1" >/dev/null; }

# ---- fases ------------------------------------------------------------------
phase() {  # phase <out> <phase> <variant> <matrix> <caller> <uid>
  local out="$1" name="$2" variant="$3" matrix="$4" caller="$5" uid="$6"
  "${PSQL[@]}" -v phase="$name" -v variant="$variant" -v matrix="$matrix" \
               -v uid="$uid" -v caller="$caller" -v runs="$runs" \
               < "$d/07-bench.sql" > "$ev/$out" 2>&1 || { cat "$ev/$out" >&2; return 1; }
  printf '  %-34s ok\n' "$out"
}

# EXPLAIN limpo (sem auto_explain) das 4 variantes numa sessao: da o tempo real
# de UMA execucao (sem o inflar do logging) + o plano externo.
explain4() {  # explain4 <out> <scenario> <uid>
  local out="$1" sc="$2" uid="$3"
  local -a f=()
  case "$sc" in
    sem_filtro)      ;;
    termo_nome_5ch)  f=(-v term=silva) ;;
    termo_nome_2ch)  f=(-v term=si) ;;
    termo_nome_3ch)  f=(-v term=sil) ;;
    termo_telefone)  f=(-v term=55119) ;;
    termo_empresa)   f=(-v term=acme) ;;
    filtro_tipo)     f=(-v ctype=lead) ;;
    filtro_tag)      f=(-v tag=vip) ;;
    empresa_igual)   f=(-v company='Acme Corp') ;;
    cargo_igual)     f=(-v job=Gerente) ;;
    intervalo_data)  f=(-v date_from="$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)") ;;
    combinado)       f=(-v term=silva -v ctype=lead -v tag=vip
                        -v date_from="$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)") ;;
    *) printf 'cenario desconhecido: %s\n' "$sc" >&2; return 1 ;;
  esac
  "${PSQL[@]}" -v uid="$uid" -v label="$sc" -v srt=name -v dir=asc -v off=0 "${f[@]}" \
      < "$d/09-explain.sql" > "$ev/$out" 2>&1
  printf '  %-40s ok\n' "$out"
}

# planos: 1 chamada com auto_explain, log do servidor fatiado por timestamp
plan() {  # plan <out> <variant> <scenario> <uid> [srt] [dir] [off]
  local out="$1" variant="$2" sc="$3" uid="$4" srt="${5:-name}" dir="${6:-asc}" off="${7:-0}"
  local -a f=()
  case "$sc" in
    sem_filtro)      ;;
    termo_nome_5ch)  f=(-v term=silva) ;;
    termo_nome_2ch)  f=(-v term=si) ;;
    termo_nome_3ch)  f=(-v term=sil) ;;
    termo_telefone)  f=(-v term=55119) ;;
    termo_empresa)   f=(-v term=acme) ;;
    filtro_tipo)     f=(-v ctype=lead) ;;
    filtro_tag)      f=(-v tag=vip) ;;
    empresa_igual)   f=(-v company='Acme Corp') ;;
    cargo_igual)     f=(-v job=Gerente) ;;
    intervalo_data)  f=(-v date_from="$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)") ;;
    combinado)       f=(-v term=silva -v ctype=lead -v tag=vip
                        -v date_from="$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%SZ)") ;;
    *) printf 'cenario desconhecido: %s\n' "$sc" >&2; return 1 ;;
  esac
  local t0 t1
  t0="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  sleep 0.05
  "${PSQL[@]}" -q -v variant="$variant" -v uid="$uid" "${f[@]}" \
               -v srt="$srt" -v dir="$dir" -v off="$off" \
               < "$d/10-plan-once.sql" >/dev/null 2>&1
  t1="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  {
    printf '# PLANO REAL (auto_explain, generic plan) -- variant=%s cenario=%s srt=%s/%s off=%s\n' \
      "$variant" "$sc" "$srt" "$dir" "$off"
    printf '# ATENCAO: "actual time" aqui esta INFLADO pelo logging do auto_explain.\n'
    printf '# O tempo valido e o do bench (bench-%s.csv / *.txt).\n' "${VOL:-?}"
    docker logs --since "$t0" --until "$t1" "$container" 2>&1 |
      grep -vE '^\s*$' |
      grep -E 'duration:|Query Text|Query Parameters|cost=|Seq Scan|Index|Bitmap|Sort|WindowAgg|Limit|Aggregate|InitPlan|SubPlan|Function Scan|Filter|Rows Removed|Heap Fetches|Buffers|Planning Time|Execution Time|Redux|->|Recheck'
  } > "$ev/$out"
  printf '  %-34s ok (%s linhas)\n' "$out" "$(wc -l < "$ev/$out")"
}

dump() {  # dump <tabela-view-sql> <csv>
  "${PSQL[@]}" -At -F',' -c "\\copy ($1) TO STDOUT CSV HEADER" > "$ev/$2"
}

printf '###### W4 -- performance de search_contacts + trigger de auditoria ######\n'
printf 'imagem=%s  runs_por_cenario=%s  volumes=%s\n' "$image" "$runs" "${volumes[*]}"
boot

for VOL in "${volumes[@]}"; do
  log "VOLUME $VOL"
  fresh_db
  apply_sql "$d/00-schema.sql"
  apply_sql "$d/generated/02-functions.sql"
  apply_sql "$d/03-baseline-indexes.sql"
  apply_sql "$d/06-rpc-variants.sql"
  "${PSQL[@]}" -v n="$VOL" < "$d/04-seed.sql" > "$ev/seed-$VOL.txt" 2>&1
  printf '  seed aplicado\n'
  "${PSQL[@]}" -At -F',' -c "\\copy (SELECT * FROM w4_meta) TO STDOUT CSV HEADER" > "$ev/meta-$VOL.csv"

  # --- distribuicao efetiva + visibilidade do chamador padrao ---------------
  "${PSQL[@]}" -q -c "
    SELECT 'agent' AS caller, count(*) AS visiveis
      FROM public.contacts c
     WHERE c.deleted_at IS NULL
       AND public.can_edit_contact(c.assigned_to, c.queue_id,
             (SELECT array_agg(v) FROM public.get_visible_agent_ids('$uid_agent'::uuid) v),
             (SELECT public.get_profile_id_for_user('$uid_agent'::uuid)),
             (SELECT public.is_admin_or_supervisor('$uid_agent'::uuid)))
    UNION ALL
    SELECT 'admin', count(*) FROM public.contacts c
     WHERE c.deleted_at IS NULL
       AND public.can_edit_contact(c.assigned_to, c.queue_id,
             (SELECT array_agg(v) FROM public.get_visible_agent_ids('$uid_admin'::uuid) v),
             (SELECT public.get_profile_id_for_user('$uid_admin'::uuid)),
             (SELECT public.is_admin_or_supervisor('$uid_admin'::uuid)));" \
    > "$ev/distribuicao-$VOL.txt" 2>&1

  # --- equivalencia funcional das variantes --------------------------------
  "${PSQL[@]}" -q -v uid="$uid_agent" < "$d/08-equivalencia.sql" \
    > "$ev/equivalencia-$VOL.txt" 2>&1

  # --- FASE 1: baseline (indices do canonico) ------------------------------
  log "VOLUME $VOL / fase 1 -- baseline (indices do canonico, HEAD)"
  phase "fase1-v0-baseline-core-extra-$VOL.txt" f1_v0_base v0 all agent "$uid_agent"
  phase "fase1-v1-inline-core-$VOL.txt"          f1_v1_inline v1 core agent "$uid_agent"
  phase "fase1-v2-branches-core-$VOL.txt"        f1_v2_branch v2 core agent "$uid_agent"
  phase "fase1-v0-admin-mini-$VOL.txt"           f1_v0_admin  v0 mini admin "$uid_admin"
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-$VOL.csv"
  dump "SELECT phase, variant, caller, scenario, sort_field, sort_dir, page_offset,
               count(*) execucoes,
               round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::numeric,2) p50_ms,
               round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::numeric,2) p95_ms,
               round(min(ms)::numeric,2) min_ms, round(max(ms)::numeric,2) max_ms,
               max(rows_out) linhas, max(total_count) total_count
          FROM w4_bench WHERE phase <> '__overhead_wrapper__'
         GROUP BY 1,2,3,4,5,6,7 ORDER BY p95_ms DESC" "resumo-$VOL.csv"

  # --- planos no estado BASELINE ------------------------------------------
  log "VOLUME $VOL / planos (baseline)"
  for v in search_contacts w4_v1_inline w4_v2_branches w4_v3_nocount; do
    for sc in sem_filtro termo_nome_5ch termo_nome_2ch filtro_tag combinado; do
      plan "plano-base-${VOL}-${v}-${sc}.txt" "$v" "$sc" "$uid_agent"
    done
    plan "plano-base-${VOL}-${v}-sem_filtro-created_desc-off500.txt" "$v" sem_filtro "$uid_agent" created_at desc 500
  done
  for sc in sem_filtro termo_nome_5ch termo_nome_2ch termo_nome_3ch filtro_tipo \
            filtro_tag intervalo_data combinado; do
    explain4 "explain-base-${VOL}-${sc}.txt" "$sc" "$uid_agent"
  done

  # --- FASE 2: indice trgm PARCIAL (2 colunas dos 7 ramos do OR) -----------
  log "VOLUME $VOL / fase 2 -- idx1 (trgm parcial: name+company)"
  "${PSQL[@]}" -q < "$d/11-idx1-parcial.sql" > "$ev/idx1-ddl-$VOL.txt" 2>&1
  phase "fase2-v0-idx1-mini-$VOL.txt" f2_v0_idx1 v0 mini agent "$uid_agent"
  phase "fase2-v0-idx1-extra-$VOL.txt" f2_v0_idx1 v0 extra agent "$uid_agent"

  # --- FASE 3: indice trgm COMPLETO (7 colunas) ---------------------------
  log "VOLUME $VOL / fase 3 -- idx2 (trgm completo: 6 GIN novos + email ja existente)"
  "${PSQL[@]}" -q < "$d/12-idx2-completo.sql" > "$ev/idx2-ddl-$VOL.txt" 2>&1
  phase "fase3-v0-idx2-extra-$VOL.txt" f3_v0_idx2 v0 extra agent "$uid_agent"
  phase "fase3-v0-idx2-core-$VOL.txt"  f3_v0_idx2 v0 core agent "$uid_agent"
  phase "fase3-v2-idx2-mini-$VOL.txt"  f3_v2_idx2 v2 mini agent "$uid_agent"

  # --- FASE 4: indices ordenados parciais (WHERE deleted_at IS NULL) -------
  log "VOLUME $VOL / fase 4 -- idx3 (ordenacao parcial WHERE deleted_at IS NULL)"
  "${PSQL[@]}" -q < "$d/13-idx3-ordenacao.sql" > "$ev/idx3-ddl-$VOL.txt" 2>&1
  phase "fase4-v0-idx3-mini-$VOL.txt"  f4_v0_idx3 v0 mini agent "$uid_agent"
  phase "fase4-v2-idx3-mini-$VOL.txt"  f4_v2_idx3 v2 mini agent "$uid_agent"
  phase "fase4-v3-idx3-core-extra-$VOL.txt" f4_v3_idx3 v3 all agent "$uid_agent"
  dump "SELECT * FROM w4_bench WHERE phase <> '__overhead_wrapper__'" "bench-all-$VOL.csv"

  # --- planos com TODOS os indices propostos ------------------------------
  log "VOLUME $VOL / planos (com os indices propostos)"
  for v in search_contacts w4_v2_branches w4_v3_nocount; do
    for sc in sem_filtro termo_nome_5ch termo_nome_2ch filtro_tag combinado; do
      plan "plano-idx-${VOL}-${v}-${sc}.txt" "$v" "$sc" "$uid_agent"
    done
  done
  for sc in sem_filtro termo_nome_5ch termo_nome_2ch termo_nome_3ch filtro_tipo \
            filtro_tag intervalo_data combinado; do
    explain4 "explain-idx-${VOL}-${sc}.txt" "$sc" "$uid_agent"
  done

  # --- custo/tamanho dos indices ------------------------------------------
  "${PSQL[@]}" -v vol="$VOL" < "$d/14-index-cost.sql" > "$ev/index-cost-$VOL.txt" 2>&1
  "${PSQL[@]}" -At -F',' -c "\\copy (
     SELECT t.relname AS tabela, c.relname AS indice,
            pg_relation_size(i.indexrelid) AS bytes_indice,
            pg_relation_size(t.oid) AS bytes_tabela,
            coalesce(s.idx_scan,0) AS scans, am.amname AS metodo
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_am am ON am.oid = c.relam
       LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
      WHERE t.relname = 'contacts' ORDER BY 3 DESC) TO STDOUT CSV HEADER" \
     > "$ev/indexes-$VOL.csv"

  # --- trigger de auditoria ------------------------------------------------
  log "VOLUME $VOL / trigger de auditoria (lotes 1/1000/3000, pareado ON/OFF)"
  "${PSQL[@]}" -v uid="$uid_agent" -v vol="$VOL" -v big=3000 -v reps=8 \
      < "$d/15-trigger-bench.sql" > "$ev/trigger-$VOL.txt" 2>&1
  dump "SELECT * FROM w4_trig WHERE vol = $VOL" "trig-$VOL.csv"

  # --- 10 sessoes concorrentes na mesma linha ------------------------------
  log "VOLUME $VOL / concorrencia (10 sessoes, mesma linha)"
  bash "$d/16-concorrencia.sh" "$container" "$uid_agent" 10 400 \
      > "$ev/concorrencia-$VOL.txt" 2>&1 || true

  log "VOLUME $VOL concluido"
done

log "RESUMO CONSOLIDADO"
"${PSQL[@]}" -At -F',' -c "\\copy (
   SELECT vol, arm, mode, k, count(*) n,
          round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::numeric,3) p50_ms
     FROM w4_trig GROUP BY 1,2,3,4 ORDER BY 1,3,4,2) TO STDOUT CSV HEADER" \
   > "$ev/trigger-consolidado.csv"

printf '\n###### FIM ######\nevidencias em %s\n' "$ev"
ls -1 "$ev" | sed 's/^/  /'
