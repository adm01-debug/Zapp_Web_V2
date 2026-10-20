#!/usr/bin/env bash
# Prova em PG descartavel do escalonamento dos jobs do pg_cron (20261002541230).
#
# A. reproduz fielmente a API usada (cron.job / cron.alter_job) + os 3 roles do
#    ambiente Supabase, com os nomes e horarios REAIS medidos no canonico em 02/10;
# B. a migration aplica os 9 offsets exatamente como declarado, e NAO toca os 3 jobs
#    de cadencia por minuto;
# C. a concorrencia por minuto cai: modela o dia inteiro (slots de hora:minuto) e
#    compara maximo por slot e slots sobrecarregados, antes x depois;
# D. idempotente: aplicar 2x nao muda nem duplica;
# E. rollback (apply_pg_cron_escalonamento(true)) devolve todos os horarios originais;
# F. falha alto se um job sumiu, em vez de aplicar meia escala.
set -euo pipefail

IMG="${PG_CRON_ESCALONAMENTO_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
NAME="pg-cron-esc-$$"
MIG="${1:?uso: $0 <caminho da migration>}"
FALHAS=0
ok()   { echo "  [OK]     $*"; }
ruim() { echo "  [FALHOU] $*"; FALHAS=$((FALHAS+1)); }

command -v docker >/dev/null || { echo "docker ausente"; exit 2; }
[ -f "$MIG" ] || { echo "migration nao encontrada: $MIG"; exit 2; }

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=teste "$IMG" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d teste >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres -d teste >/dev/null 2>&1 || { echo "PG nao subiu"; exit 2; }

q() { docker exec -i -e PGPASSWORD=teste "$NAME" psql -U postgres -d teste -X -q -A -t -v ON_ERROR_STOP=1 "$@"; }
aplica() { docker exec -i -e PGPASSWORD=teste "$NAME" psql -U postgres -d teste -X -q -v ON_ERROR_STOP=1 < "$MIG" >/dev/null; }

# --------------------------------------------------------------- bootstrap (A)
q >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid    bigserial PRIMARY KEY,
  jobname  text NOT NULL,
  schedule text NOT NULL,
  command  text NOT NULL DEFAULT 'select 1'
);
CREATE FUNCTION cron.alter_job(job_id bigint, schedule text)
RETURNS void LANGUAGE sql AS $f$
  UPDATE cron.job SET schedule = alter_job.schedule WHERE jobid = alter_job.job_id;
$f$;
INSERT INTO cron.job (jobname, schedule) VALUES
  ('talkx-scheduler-1min',        '* * * * *'),
  ('tasks-notify-due',            '* * * * *'),
  ('ai-jobs-tick-1min',           '1-59 * * * *'),
  ('expire-stale-agent-presence', '*/2 * * * *'),
  ('multiplix-send-trigger',      '*/2 * * * *'),
  ('gmail-incremental-sync',      '*/5 * * * *'),
  ('connection-health-check',     '*/5 * * * *'),
  ('cleanup-edge-rate-limits',    '*/15 * * * *'),
  ('avatars-refresh',             '0 * * * *'),
  ('cleanup-link-preview-cache',  '0 3 * * *'),
  ('vacuum-contacts-daily',       '30 3 * * *'),
  ('vacuum-messages-post-expurgo','0 3 2 9 *');
SQL
ok "A. API cron reproduzida + 12 jobs reais semeados"
ANTES=$(q -c "SELECT jobname||' '||schedule FROM cron.job ORDER BY jobname")

# ------------------------------------------------------------- aplica (B)
aplica
ESPERADO='cleanup-edge-rate-limits 7-52/15 * * * *
cleanup-link-preview-cache 12 3 * * *
connection-health-check 2-57/5 * * * *
expire-stale-agent-presence 1-59/2 * * * *
gmail-incremental-sync 0-55/5 * * * *
multiplix-send-trigger 0-58/2 * * * *
vatcuum-remover 1'
DEPOIS=$(q -c "SELECT jobname||' '||schedule FROM cron.job WHERE jobname NOT IN ('talkx-scheduler-1min','tasks-notify-due','ai-jobs-tick-1min') ORDER BY jobname")
CONFERIR=$(q -c "SELECT count(*) FROM cron.job WHERE schedule IN ('1-59/2 * * * *','0-58/2 * * * *','0-55/5 * * * *','2-57/5 * * * *','7-52/15 * * * *','7 * * * *','12 3 * * *','42 3 * * *','20 3 2 9 *')")
[ "$CONFERIR" = "9" ] && ok "B. os 9 offsets declarados estao aplicados" || ruim "B. esperava 9 offsets aplicados, achei $CONFERIR"
for j in talkx-scheduler-1min tasks-notify-due ai-jobs-tick-1min; do
  A=$(printf '%s\n' "$ANTES" | grep -F "$j " | sed "s/^$j //")
  B=$(q -c "SELECT schedule FROM cron.job WHERE jobname='$j'")
  [ "$A" = "$B" ] && ok "B. $j intocado ($B)" || ruim "B. $j mudou indevidamente: '$A' -> '$B'"
done

# --------------------------------------------------- concorrencia (C)
medir() {
  q -c "SELECT jobname||'|'||schedule FROM cron.job" > "$TMPDIR/jobs-medir.txt"
  python3 "$(dirname "$0")/pg-cron-concorrencia.py" "$1" "$TMPDIR/jobs-medir.txt"
}
echo "  --- C. concorrencia por minuto (dia inteiro) ---"
q -c "SELECT public.apply_pg_cron_escalonamento(true)" >/dev/null
medir "antes " || ruim "C. medicao ANTES nao produziu dados"
q -c "SELECT public.apply_pg_cron_escalonamento(false)" >/dev/null
medir "depois" || ruim "C. medicao DEPOIS nao produziu dados"

# ------------------------------------------------------ idempotencia (D)
S1=$(q -c "SELECT string_agg(jobname||' '||schedule, ',' ORDER BY jobname) FROM cron.job")
aplica
S2=$(q -c "SELECT string_agg(jobname||' '||schedule, ',' ORDER BY jobname) FROM cron.job")
[ "$S1" = "$S2" ] && ok "D. idempotente: 2a aplicacao nao mudou nada" || ruim "D. 2a aplicacao alterou horarios"
[ "$(q -c "SELECT count(*) FROM cron.job")" = "12" ] && ok "D. nao duplicou job (12)" || ruim "D. duplicou job"

# ---------------------------------------------------------- rollback (E)
q -c "SELECT public.apply_pg_cron_escalonamento(true)" >/dev/null
VOLTOU=$(q -c "SELECT jobname||' '||schedule FROM cron.job ORDER BY jobname")
if [ "$VOLTOU" = "$ANTES" ]; then ok "E. rollback devolveu TODOS os horarios originais"; else
  ruim "E. rollback incompleto"; diff <(printf '%s\n' "$ANTES") <(printf '%s\n' "$VOLTOU") || true; fi

# ---------------------------------------------------------- falha alto (F)
q -c "DELETE FROM cron.job WHERE jobname='vatcuum-remover' OR jobname='vacuum-contacts-daily'" >/dev/null
SAIDA=$(q -c "SELECT public.apply_pg_cron_escalonamento(false)" 2>&1 || true)
printf '%s' "$SAIDA" | grep -q "esperado 1x em cron.job" && ok "F. job ausente aborta com erro claro (nao aplica meia escala)" || ruim "F. nao abortou: $SAIDA"

echo
if [ "$FALHAS" -eq 0 ]; then echo "RESULTADO: TODAS AS PROVAS PASSARAM"; exit 0; fi
echo "RESULTADO: $FALHAS PROVA(S) FALHARAM"; exit 1
