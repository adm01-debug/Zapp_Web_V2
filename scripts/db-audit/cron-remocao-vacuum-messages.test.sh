#!/usr/bin/env bash
# Prova, em PostgreSQL descartavel, da remocao do job pg_cron residual
# `vacuum-messages-post-expurgo` (item 471 / DELTA-CRON-ANUAL).
#
# A. reproduz a API do pg_cron usada (cron.job + cron.schedule/unschedule/alter_job) e os
#    12 jobs REAIS da frota (nomes e horarios do canonico; os comandos dos jobs que nao
#    sao o alvo sao curtos de proposito -- o defeito nao esta no comando deles), com os 3
#    papeis do Supabase (anon/authenticated/service_role);
# B. RED 1 -- o job residual esta VIVO na agenda anual (`20 3 2 9 *`): e o defeito do cartao;
# C. RED 2 -- remover o job SEM reescrever public.apply_pg_cron_escalonamento() faz o
#    caminho de recuperacao documentado ABORTAR ("esperado 1x em cron.job, encontrado 0"):
#    e por isso que a correcao precisa das duas coisas na mesma migration;
# D. GREEN -- aplica ESTE arquivo de migration (o real): o job some, os outros 11 jobs
#    ficam intactos (nome, agenda, comando, dono e active identicos) e a funcao segue viva:
#    apply(false) = apply(true) = 8, e ela nao recria o job removido;
# E. ACL da funcao: PUBLIC fora, anon/authenticated levam 42501, service_role executa;
# F. idempotencia: aplicar de novo nao falha e nao muda nada;
# G. rollback: extraido do PROPRIO arquivo (`^-- Rollback:`), executado no banco -- o job
#    volta com agenda e comando de antes e a funcao volta a ter as 9 linhas (apply = 9,
#    devolvendo o job a `0 3 2 9 *`); reaplicar a migration remove de novo.
#
# Uso: bash scripts/db-audit/cron-remocao-vacuum-messages.test.sh <migration da remocao>
set -euo pipefail

IMG="${CRON_REMOCAO_VACUUM_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
NAME="cron-rm-vac-$$"
MIG="${1:?uso: $0 <caminho da migration que remove o job residual>}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
MIG_ESC="$RAIZ/supabase/migrations/20261002541230_pg_cron_escalonar_jobs.sql"
JOB='vacuum-messages-post-expurgo'
FALHAS=0
ok()   { echo "  [OK]     $*"; }
ruim() { echo "  [FALHOU] $*"; FALHAS=$((FALHAS+1)); }

command -v docker >/dev/null || { echo "docker ausente"; exit 2; }
[[ -f "$MIG" ]] || { echo "migration nao encontrada: $MIG"; exit 2; }
[[ -f "$MIG_ESC" ]] || { echo "migration do escalonamento nao encontrada: $MIG_ESC"; exit 2; }

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=teste "$IMG" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d teste >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres -d teste >/dev/null 2>&1 || { echo "PG nao subiu"; exit 2; }

q()            { docker exec -i -e PGPASSWORD=teste "$NAME" psql -U postgres -d teste -X -q -A -t -v ON_ERROR_STOP=1 "$@"; }
aplica()       { docker exec -i -e PGPASSWORD=teste "$NAME" psql -U postgres -d teste -X -q -v ON_ERROR_STOP=1 < "$1" >/dev/null; }
aplica_stdin() { docker exec -i -e PGPASSWORD=teste "$NAME" psql -U postgres -d teste -X -q -v ON_ERROR_STOP=1 -f /dev/stdin >/dev/null; }

# ------------------------------------------------------------------- bootstrap (A)
q >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid    bigserial PRIMARY KEY,
  jobname  text NOT NULL,
  schedule text NOT NULL,
  command  text NOT NULL DEFAULT 'select 1',
  username text NOT NULL DEFAULT current_user,
  active   boolean NOT NULL DEFAULT true,
  UNIQUE (jobname, username)          -- indice unico real do pg_cron (jobname, username)
);
-- pg_cron de verdade: unschedule/schedule/alter_job resolvem o dono POR DENTRO e alcancam
-- cron.job (que e do supabase_admin). Aqui os stubs fazem o mesmo papel.
CREATE FUNCTION cron.alter_job(job_id bigint, schedule text)
RETURNS void LANGUAGE sql AS $f$
  UPDATE cron.job SET schedule = alter_job.schedule WHERE jobid = alter_job.job_id;
$f$;
CREATE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE plpgsql AS $f$
BEGIN
  DELETE FROM cron.job WHERE jobname = job_name AND username = session_user;
  IF NOT FOUND THEN RAISE 'Job named % not found', job_name; END IF;
  RETURN true;
END;
$f$;
CREATE FUNCTION cron.unschedule(job_id bigint)
RETURNS boolean LANGUAGE plpgsql AS $f$
BEGIN
  DELETE FROM cron.job WHERE jobid = job_id;
  IF NOT FOUND THEN RAISE 'Job with id % not found', job_id; END IF;
  RETURN true;
END;
$f$;
CREATE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = p_jobname AND username = session_user;
  IF v_id IS NULL THEN
    INSERT INTO cron.job (jobname, schedule, command) VALUES (p_jobname, p_schedule, p_command)
      RETURNING jobid INTO v_id;
  ELSE
    UPDATE cron.job SET schedule = p_schedule, command = p_command WHERE jobid = v_id;
  END IF;
  RETURN v_id;
END;
$f$;
INSERT INTO cron.job (jobname, schedule, command) VALUES
  ('talkx-scheduler-1min',        '* * * * *',     'SELECT public.trigger_talkx_engine_tick()'),
  ('tasks-notify-due',            '* * * * *',     'SELECT public.notify_due_tasks()'),
  ('ai-jobs-tick-1min',           '1-59 * * * *',  'SELECT public.trigger_ai_jobs_tick()'),
  ('expire-stale-agent-presence', '*/2 * * * *',   'SELECT public.expire_stale_agent_presence()'),
  ('multiplix-send-trigger',      '*/2 * * * *',   'SELECT public.multiplix_send_trigger()'),
  ('gmail-incremental-sync',      '*/5 * * * *',   'SELECT public.gmail_incremental_sync()'),
  ('connection-health-check',     '*/5 * * * *',   'SELECT public.connection_health_check()'),
  ('cleanup-edge-rate-limits',    '*/15 * * * *',  'DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval ''1 hour'''),
  ('avatars-refresh',             '0 * * * *',     'SELECT public.batch_fetch_avatars()'),
  ('cleanup-link-preview-cache',  '0 3 * * *',     'SELECT public.cleanup_link_preview_cache()'),
  ('vacuum-contacts-daily',       '30 3 * * *',    'VACUUM ANALYZE public.contacts'),
  ('vacuum-messages-post-expurgo','0 3 2 9 *',     'VACUUM FULL ANALYZE public.messages');
SQL
ok "A. API do cron reproduzida + os 12 jobs reais semeados"

# A funcao REAL vem da migration do escalonamento (nao de uma copia): aplica-la tambem
# leva a frota ao estado vivo de hoje (o job alvo em `20 3 2 9 *`).
aplica "$MIG_ESC"
ok "A. 20261002541230 aplicada: frota no estado vivo (offsets escalonados)"

# ------------------------------------------------------------- RED 1: o defeito (B)
VIVO="$(q -c "SELECT schedule||'|'||command||'|'||username||'|'||active FROM cron.job WHERE jobname='$JOB'")"
if [[ "$VIVO" = "20 3 2 9 *|VACUUM FULL ANALYZE public.messages|postgres|true" ]]; then
  ok "B. RED: o job residual esta VIVO na agenda anual (20 3 2 9 *, active, dono postgres)"
else
  ruim "B. estado de partida inesperado: '$VIVO'"
fi

# -------------------------------------- RED 2: sem a reescrita a funcao aborta (C)
CX="$(q -c "BEGIN; SELECT cron.unschedule('$JOB'); SELECT public.apply_pg_cron_escalonamento(false);" 2>&1 || true)"
if printf '%s' "$CX" | grep -q 'esperado 1x em cron.job'; then
  ok "C. RED: com o job fora, apply_pg_cron_escalonamento() ABORTA (a remocao sozinha quebra o caminho de recuperacao)"
else
  ruim "C. a funcao nao abortou com o job ausente: $CX"
fi
[[ "$(q -c "SELECT count(*) FROM cron.job WHERE jobname='$JOB'")" = "1" ]] \
  && ok "C. a transacao de prova nao deixou rastro (o job continua la)" \
  || ruim "C. a prova de RED 2 mexeu no banco"

# ------------------------------------------------------- GREEN: aplica a migration (D)
ANTES="$(q -c "SELECT jobname||'|'||schedule||'|'||command||'|'||username||'|'||active FROM cron.job ORDER BY jobname")"
aplica "$MIG"

[[ "$(q -c "SELECT count(*) FROM cron.job WHERE jobname='$JOB'")" = "0" ]] \
  && ok "D. o job residual foi REMOVIDO" \
  || ruim "D. o job residual continua em cron.job"
[[ "$(q -c "SELECT count(*) FROM cron.job")" = "11" ]] \
  && ok "D. a frota ficou com 11 jobs" \
  || ruim "D. contagem de jobs inesperada: $(q -c 'SELECT count(*) FROM cron.job')"
DEPOIS="$(q -c "SELECT jobname||'|'||schedule||'|'||command||'|'||username||'|'||active FROM cron.job ORDER BY jobname")"
ANTES_SEM="$(printf '%s\n' "$ANTES" | grep -v "^$JOB|")"
if [[ "$DEPOIS" = "$ANTES_SEM" ]]; then
  ok "D. os outros 11 jobs intactos (agenda, comando, dono e active identicos)"
else
  ruim "D. algum outro job foi tocado"
  diff <(printf '%s\n' "$ANTES_SEM") <(printf '%s\n' "$DEPOIS") || true
fi
[[ "$(q -c "SELECT public.apply_pg_cron_escalonamento(false)")" = "8" ]] \
  && ok "D. apply(false) segue vivo: aplica os 8 jobs restantes" \
  || ruim "D. apply(false) nao devolveu 8"
[[ "$(q -c "SELECT public.apply_pg_cron_escalonamento(true)")" = "8" ]] \
  && ok "D. apply(true) segue vivo: reverte os 8 jobs restantes" \
  || ruim "D. apply(true) nao devolveu 8"
[[ "$(q -c "SELECT count(*) FROM cron.job WHERE jobname='$JOB'")" = "0" ]] \
  && ok "D. a funcao NAO recria o job removido" \
  || ruim "D. a funcao recriou o job removido"

# --------------------------------------------------------------------- ACL (E)
for papel in anon authenticated; do
  SAIDA="$(q -c "SET ROLE $papel; SELECT public.apply_pg_cron_escalonamento(false);" 2>&1 || true)"
  if printf '%s' "$SAIDA" | grep -q 'permission denied for function'; then
    ok "E. $papel nao executa (42501)"
  else
    ruim "E. $papel executou: $SAIDA"
  fi
done
SAIDA="$(q -c "SET ROLE service_role; SELECT public.apply_pg_cron_escalonamento(false);" 2>&1 || true)"
[[ "$SAIDA" = "8" ]] && ok "E. service_role executa (8)" || ruim "E. service_role: $SAIDA"
PUB="$(q -c "SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a WHERE p.oid = 'public.apply_pg_cron_escalonamento(boolean)'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'")"
NULA="$(q -c "SELECT (proacl IS NULL)::text FROM pg_proc WHERE oid = 'public.apply_pg_cron_escalonamento(boolean)'::regprocedure")"
if [[ "$PUB" = "0" && "$NULA" = "false" ]]; then
  ok "E. PUBLIC fora da ACL da funcao (ACL explicita, sem o EXECUTE padrao)"
else
  ruim "E. PUBLIC: EXECUTE para PUBLIC=$PUB, proacl nula=$NULA"
fi

# --------------------------------------------------------------- idempotencia (F)
S1="$(q -c "SELECT string_agg(jobname||' '||schedule||' '||command, ',' ORDER BY jobname) FROM cron.job")"
aplica "$MIG"
S2="$(q -c "SELECT string_agg(jobname||' '||schedule||' '||command, ',' ORDER BY jobname) FROM cron.job")"
[[ "$S1" = "$S2" ]] && ok "F. idempotente: 2a aplicacao nao mudou nada" || ruim "F. a 2a aplicacao mudou a frota"
[[ "$(q -c "SELECT count(*) FROM cron.job")" = "11" ]] && ok "F. nao duplicou job (11)" || ruim "F. duplicou job"
[[ "$(q -c "SELECT public.apply_pg_cron_escalonamento(false)")" = "8" ]] \
  && ok "F. a funcao segue viva apos reaplicar" || ruim "F. apply(false) deixou de funcionar"

# -------------------------------------------------------------------- rollback (G)
RB="$(grep '^-- Rollback:' "$MIG" | cut -d' ' -f3-)"
[[ -n "$RB" ]] || ruim "G. a migration nao tem a linha '-- Rollback:' preenchida"
printf '%s\n' "$RB" | aplica_stdin
VOLTOU="$(q -c "SELECT schedule||'|'||command||'|'||username||'|'||active FROM cron.job WHERE jobname='$JOB'")"
if [[ "$VOLTOU" = "20 3 2 9 *|VACUUM FULL ANALYZE public.messages|postgres|true" ]]; then
  ok "G. rollback devolveu o job com agenda, comando, dono e active de antes"
else
  ruim "G. o job nao voltou como estava: '$VOLTOU'"
fi
[[ "$(q -c "SELECT count(*) FROM cron.job")" = "12" ]] && ok "G. frota de volta a 12 jobs" || ruim "G. frota nao voltou a 12"
[[ "$(q -c "SELECT public.apply_pg_cron_escalonamento(true)")" = "9" ]] \
  && ok "G. a funcao do rollback tem as 9 linhas" \
  || ruim "G. a funcao do rollback nao devolveu 9"
[[ "$(q -c "SELECT schedule FROM cron.job WHERE jobname='$JOB'")" = "0 3 2 9 *" ]] \
  && ok "G. revertida, ela devolve o job ao horario original (0 3 2 9 *)" \
  || ruim "G. horario original esperado nao veio"
[[ "$(q -c "SELECT public.apply_pg_cron_escalonamento(false)")" = "9" ]] \
  && ok "G. e volta a escalonar o job (20 3 2 9 *)" \
  || ruim "G. reescalonamento do rollback falhou"
aplica "$MIG"
[[ "$(q -c "SELECT count(*) FROM cron.job WHERE jobname='$JOB'")" = "0" ]] \
  && ok "G. reaplicar a migration remove de novo (ciclo fecha)" \
  || ruim "G. reaplicar a migration nao removeu o job"

echo
if [[ "$FALHAS" -eq 0 ]]; then echo "RESULTADO: TODAS AS PROVAS PASSARAM"; exit 0; fi
echo "RESULTADO: $FALHAS PROVA(S) FALHARAM"; exit 1
