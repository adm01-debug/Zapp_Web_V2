#!/usr/bin/env bash
# Agendamento do expurgo de instance_auth_events (cartao eventos-auth-webhook-instancia).
#
# O que prova, contra o BLOCO DO EXTRAIDO VERBATIM da migration
# supabase/migrations/20261014120711_instance_auth_events.sql (marcadores
# DO $agenda_purge$ ... $agenda_purge$; — o teste falha se eles sumirem):
#   A. base SEM pg_cron (container vanilla, sem a extensao): o bloco aplica
#      limpo (exit 0), nao toca em nada e emite o NOTICE de agenda ignorada;
#   B. stubs FIEIS do pg_cron (assinaturas reais medidas no banco local da
#      tarefa: schedule(job_name text, schedule text, command text),
#      unschedule(job_name text), unschedule(job_id bigint)): o bloco cria
#      EXATAMENTE 1 job com schedule '45 3 * * *' e command
#      'SELECT public.purge_instance_auth_events(30)' (ordem dos argumentos) e
#      a 2a execucao continua com 1 job (unschedule-por-nome + reagenda);
#   C. controle negativo: chamada ao stub com os argumentos trocados NAO passa
#      na assercao do bloco B (a assercao distingue as posicoes, nao e vacua).
#
# LIMITE DECLARADO: o container NAO tem o pg_cron real (a imagem vanilla nao
# distribui os binarios). Os stubs reproduzem a superficie usada pelo bloco
# (tabela + assinaturas); a prova contra o pg_cron de verdade (agendar de
# verdade, 2 execucoes => 1 linha, limpeza) esta no relato do cartao, rodada no
# banco local da tarefa.
#
# REGISTRO PENDENTE: scripts/db-audit/instance-auth-events-agenda.test.sh
# (sem passo no db-guard.yml — o cartao proibe adicionar CI Step).
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261014120711_instance_auth_events.sql"
postgres_image="${INSTANCE_AUTH_AGENDA_TEST_POSTGRES_IMAGE:-${POSTGRES_TEST_IMAGE:-postgres:17-alpine}}"
container_name="zapp-v2-inst-auth-agenda-$$"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok() { printf '[OK] %s\n' "$1"; }

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-inst-auth-agenda-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

mkdir -p "${TMPDIR:-/tmp}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Extrai EXATAMENTE o bloco DO da migration (nao copia: segue o arquivo real).
sed -n '/^DO \$agenda_purge\$/,/^\$agenda_purge\$;/p' "$migration" > "$tmp_dir/bloco.sql"
[[ -s "$tmp_dir/bloco.sql" ]] || fail 'marcadores DO $agenda_purge$ nao encontrados na migration'
grep -q 'to_regclass' "$tmp_dir/bloco.sql" || fail 'bloco extraido sem a guarda to_regclass (migration errada?)'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

prontas=0
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -qAt -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
    prontas=$((prontas + 1)); (( prontas >= 2 )) && break
  else prontas=0; fi
  sleep 1
done
(( prontas >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

psql_exec() {
  docker exec -i "$container_name" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
psql_val() {
  docker exec "$container_name" psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"
}

# Confere que a base e mesmo SEM pg_cron (a premissa do bloco A).
[[ "$(psql_val "SELECT count(*) FROM pg_extension WHERE extname='pg_cron';")" == '0' ]] \
  || fail 'container descartavel veio COM pg_cron (premissa do bloco A quebrada)'
[[ "$(psql_val "SELECT to_regclass('cron.job') IS NULL;")" == 't' ]] \
  || fail 'schema cron.job existe no container vanilla (premissa do bloco A quebrada)'

# ── BLOCO A: base sem extensao — o bloco aplica limpo ──
saida_a="$(psql_exec < "$tmp_dir/bloco.sql" 2>&1)" || fail "bloco DO falhou sem pg_cron: $saida_a"
[[ "$saida_a" == *'pg_cron ausente'* ]] || fail "sem pg_cron, esperava o NOTICE de agenda ignorada (saiu: $saida_a)"
[[ "$(psql_val "SELECT to_regclass('cron.job') IS NULL;")" == 't' ]] \
  || fail 'o bloco criou algo sem pg_cron (deveria ser no-op)'
ok 'A: sem pg_cron o bloco aplica limpo e nao agenda nada'

# ── Stubs FIEIS do pg_cron (superficie usada pelo bloco, assinaturas reais) ──
cat > "$tmp_dir/stubs.sql" <<'SQL'
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text UNIQUE NOT NULL,
  schedule text NOT NULL,
  command text NOT NULL
);
-- FIEL ao real: agendar nome repetido ERRA (por isso o bloco faz unschedule
-- antes) — sem ON CONFLICT, para a idempotencia do bloco B ser provada de
-- verdade pelo unschedule-por-nome.
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  RETURNING jobid $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobname = job_name RETURNING true $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobid = job_id RETURNING true $$;
SQL
psql_exec < "$tmp_dir/stubs.sql" >/dev/null || fail 'falha ao criar os stubs do pg_cron'

# ── BLOCO B: com agenda — 1 job, argumentos nas posicoes certas, idempotente ──
psql_exec < "$tmp_dir/bloco.sql" >/dev/null || fail 'bloco DO falhou com os stubs do pg_cron'
linha_b="$(psql_val "SELECT jobname || '|' || schedule || '|' || command FROM cron.job;")"
[[ "$linha_b" == 'purge-instance-auth-events|45 3 * * *|SELECT public.purge_instance_auth_events(30)' ]] \
  || fail "job agendado errado (linha: $linha_b)"
psql_exec < "$tmp_dir/bloco.sql" >/dev/null || fail '2a execucao do bloco DO falhou'
[[ "$(psql_val "SELECT count(*) FROM cron.job WHERE jobname='purge-instance-auth-events';")" == '1' ]] \
  || fail '2a execucao duplicou o job (unschedule-por-nome nao funcionou)'
ok 'B: agenda 1 job com schedule/command certos e re-execucao idempotente'

# ── BLOCO C: controle negativo — args trocados NAO passam na assercao ──
psql_val "SELECT cron.unschedule(job_name := 'purge-instance-auth-events');" >/dev/null
psql_val "SELECT cron.schedule(schedule := 'SELECT public.purge_instance_auth_events(30)', command := '45 3 * * *', job_name := 'purge-instance-auth-events');" >/dev/null
linha_c="$(psql_val "SELECT jobname || '|' || schedule || '|' || command FROM cron.job;")"
[[ "$linha_c" != 'purge-instance-auth-events|45 3 * * *|SELECT public.purge_instance_auth_events(30)' ]] \
  || fail 'controle negativo vacuo: args trocados passaram na assercao'
ok 'C: controle negativo confirma que a assercao distingue as posicoes'

ok 'instance-auth-events-agenda: A (sem extensao) + B (agenda/idempotencia) + C (controle) OK'
