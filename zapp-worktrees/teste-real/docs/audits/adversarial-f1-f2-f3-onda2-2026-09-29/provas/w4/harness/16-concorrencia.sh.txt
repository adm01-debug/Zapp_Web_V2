#!/usr/bin/env bash
# =============================================================================
# W4 -- 10 sessoes concorrentes atualizando a MESMA linha de `contacts`.
# Uso: bash 16-concorrencia.sh <container> <uid-uuid> [n_sessoes] [hold_ms]
# =============================================================================
# Mede / coleta:
#   * tempo de parede total (as sessoes serializam no lock da linha),
#   * o tempo do UPDATE de CADA sessao (inclui a espera pelo lock) -- 2a linha
#     de `\timing` do script da sessao (a 1a e o BEGIN),
#   * pico de locks NAO concedidos (`pg_locks.granted = false`) amostrado durante
#     a corrida + snapshot literal de pg_locks nesse instante,
#   * `log_lock_waits` ligado em cada sessao: o proprio servidor registra
#     "still waiting for ... after N ms" no log (evidencia independente do
#     amostrador). deadlock_timeout reduzido para 100 ms para capturar cedo.
# Controle: as mesmas 10 sessoes atualizando 10 linhas DIFERENTES (sem contencao).
# =============================================================================
set -Eeuo pipefail

container="${1:?container}"
uid="${2:?uid}"
sessions="${3:-10}"
hold_ms="${4:-250}"

P()  { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d w4 "$@"; }
PA() { docker exec -i "$container" psql -X -q -U postgres -d w4 "$@"; }

P -c "SELECT set_config('request.jwt.claim.sub','$uid',false)" >/dev/null

row_same="$(P -At -c "SELECT id FROM public.contacts ORDER BY id LIMIT 1")"
mapfile -t rows_diff < <(P -At -c "SELECT id FROM public.contacts ORDER BY id LIMIT $sessions")

u_session() {
  local rid="$1"
  docker exec -i "$container" psql -X -q -U postgres -d w4 -v rid="$rid" -v hold="$hold_ms" <<'SQL' 2>&1
SET log_lock_waits = on;
SET deadlock_timeout = '100ms';
SELECT set_config('w4.rid', :'rid', false);
SELECT set_config('w4.hold', :'hold', false);
BEGIN;
DO $blk$
DECLARE
  t0  timestamptz;
  ms  double precision;
  rid uuid := current_setting('w4.rid')::uuid;
  h   double precision := current_setting('w4.hold')::double precision;
BEGIN
  t0 := clock_timestamp();
  UPDATE public.contacts
     SET address = CASE WHEN address LIKE '% [w4c]' THEN left(address, length(address) - 6)
                        ELSE coalesce(address, '') || ' [w4c]' END
   WHERE id = rid;
  ms := 1000 * extract(epoch FROM clock_timestamp() - t0);
  RAISE NOTICE 'W4CC|update_ms=%|pid=%', round(ms::numeric, 3), pg_backend_pid();
  PERFORM pg_sleep(h / 1000.0);
END
$blk$;
COMMIT;
SQL
}

snapshot() { PA -c "SELECT l.locktype, l.mode, l.granted, count(*) AS n
                     FROM pg_locks l WHERE l.locktype <> 'virtualxid'
                    GROUP BY 1,2,3 ORDER BY 3,1,2;"; }
# uma unica ida ao container por amostra (duas consultas por amostra nao
# conseguem amostrar rapido o suficiente)
both() { PA -At -c "SELECT (SELECT count(*) FROM pg_locks WHERE NOT granted)::text
                        || '|' || (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock')::text;"; }

run_case() {
  local label="$1"; shift
  local ids=("$@")
  local peak_ung=0 peak_act=0 snap="" samples=0
  local logs=() pids=() i lf

  for i in "${!ids[@]}"; do
    lf="$(mktemp)"; logs+=("$lf")
    u_session "${ids[$i]}" >"$lf" 2>&1 &
    pids+=("$!")
  done

  # amostra a contencao enquanto as sessoes rodam
  while :; do
    local alive=0
    for p in "${pids[@]}"; do kill -0 "$p" 2>/dev/null && alive=1; done
    [[ "$alive" -eq 0 ]] && break
    local linha u a
    linha="$(both || true)"; linha="${linha%%$'\n'*}"
    u="${linha%%|*}"; a="${linha##*|}"
    u="${u:-0}"; a="${a:-0}"
    (( samples++ )) || true
    if (( u > peak_ung )); then peak_ung=$u; fi
    if (( a > peak_act )); then peak_act=$a; fi
    if (( u > 0 )) && [[ -z "$snap" ]]; then snap="$(snapshot || true)"; fi
  done
  for p in "${pids[@]}"; do wait "$p" || true; done

  printf '\n#### CASO: %s  (n=%s sessoes, hold=%sms, amostras=%s)\n' "$label" "${#ids[@]}" "$hold_ms" "$samples"
  printf 'PICO_LOCKS_NAO_CONCEDIDOS=%s\n' "$peak_ung"
  printf 'PICO_SESSOES_ESPERANDO_LOCK=%s\n' "$peak_act"
  printf '%-10s %s\n' "sessao" "UPDATE_ms (inclui espera)"
  local t tot=0 n=0 mx=0
  for i in "${!logs[@]}"; do
    t="$(grep -o 'W4CC|update_ms=[0-9.]*' "${logs[$i]}" | head -1 | cut -d= -f2)"
    [[ -z "$t" ]] && t="NAO_MEDIDO"
    printf '%-10s %s\n' "sessao$i" "$t"
    if [[ "$t" != "NAO_MEDIDO" ]]; then
      tot="$(echo "$tot + $t" | bc -l)"; n=$((n+1))
      mx="$(echo "if ($t > $mx) $t else $mx" | bc -l)"
    fi
    rm -f "${logs[$i]}"
  done
  if (( n > 0 )); then printf 'MEDIA_UPDATE_MS=%.1f  MAX_UPDATE_MS=%.1f\n' \
    "$(echo "$tot / $n" | bc -l)" "$mx"; fi
  printf '%s\n' "--- pg_locks no primeiro instante com lock nao concedido ---"
  if [[ -n "$snap" ]]; then printf '%s\n' "$snap"; else printf '(nenhum lock nao concedido amostrado)\n'; fi
}

printf '=============== CONTENCAO: MESMA LINHA (%s) ===============\n' "$row_same"
same=()
for _ in $(seq 1 "$sessions"); do same+=("$row_same"); done
run_case "mesma_linha" "${same[@]}"

printf '\n=============== CONTROLE: LINHAS DIFERENTES ===============\n'
run_case "linhas_diferentes" "${rows_diff[@]}"

printf '\n=============== log_lock_waits do servidor (ultimos 120s) ===============\n'
docker logs --since 120s "$container" 2>&1 \
  | grep -E "still waiting for|Process holding the lock" | tail -30 || true
