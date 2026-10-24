#!/usr/bin/env bash
# Prova em PostgreSQL DESCARTAVEL da migration user_sessions_expire_diario (N-008).
#   1. RED: expire_user_sessions nao existe antes da migration.
#   2. GREEN: sessao vencida vira is_active=false com ended_at; sessao valida nao muda.
#   3. Cron: 1 job diario (stub de cron.schedule); reaplicar nao duplica.
#   4. Privilegio: authenticated/anon nao executam; service_role executa.
#   5. Rollback: a linha -- Rollback: remove funcao e job.
# Uso: bash scripts/db-audit/user-sessions-expire.test.sh
set -euo pipefail

MIGRATION="supabase/migrations/20261010063527_user_sessions_expire_diario.sql"
CNAME="usess-expire-$$-$(date +%s)"
PSQL=(docker exec -i "$CNAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres)

cleanup() { docker rm -f "$CNAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f "$MIGRATION" ] || { echo "[FALHOU] migration nao encontrada: $MIGRATION"; exit 1; }

docker run --rm -d --name "$CNAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres ${POSTGRES_TEST_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24} >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CNAME" pg_isready -U postgres -d postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CNAME" pg_isready -U postgres -d postgres >/dev/null

# fixtures: papeis, stub de pg_cron e user_sessions minima (mesmas colunas da tabela real)
"${PSQL[@]}" <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
  language sql as $f$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid::bigint $f$;
create function cron.unschedule(p_name text) returns boolean
  language sql as $f$
  with d as (delete from cron.job where jobname = p_name returning 1) select exists (select 1 from d) $f$;
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  is_active boolean default true,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  ended_at timestamptz
);
insert into public.user_sessions (id, user_id, expires_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '2 hours'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() + interval '2 hours');
SQL

if "${PSQL[@]}" -c "select public.expire_user_sessions()" >/dev/null 2>&1; then
  echo "[FALHOU] expire_user_sessions ja existia antes da migration"; exit 1
fi
echo "[OK] RED: expire_user_sessions nao existia antes"

"${PSQL[@]}" -f /dev/stdin < "$MIGRATION"
"${PSQL[@]}" -f /dev/stdin < "$MIGRATION"   # idempotente

N="$("${PSQL[@]}" -Atc "set role service_role; select public.expire_user_sessions()" | tail -1)"
[ "$N" = "1" ] || { echo "[FALHOU] deveria encerrar 1 sessao, encerrou $N"; exit 1; }
VENC="$("${PSQL[@]}" -Atc "select is_active::text || ',' || (ended_at is not null)::text from public.user_sessions where id='11111111-1111-4111-8111-111111111111'")"
[ "$VENC" = "false,true" ] || { echo "[FALHOU] sessao vencida: $VENC"; exit 1; }
VALI="$("${PSQL[@]}" -Atc "select is_active::text || ',' || (ended_at is null)::text from public.user_sessions where id='22222222-2222-4222-8222-222222222222'")"
[ "$VALI" = "true,true" ] || { echo "[FALHOU] sessao valida mudou: $VALI"; exit 1; }
echo "[OK] GREEN: vencida encerrada com ended_at; valida intacta"

JOBS="$("${PSQL[@]}" -Atc "select count(*) || ',' || min(schedule) from cron.job where jobname='user-sessions-expire-diario' and command like '%expire_user_sessions()%'")"
[ "$JOBS" = "1,17 3 * * *" ] || { echo "[FALHOU] job diario: $JOBS"; exit 1; }
echo "[OK] GREEN: 1 job diario no pg_cron (stub), sem duplicar ao reaplicar"

for R in authenticated anon; do
  if "${PSQL[@]}" -Atc "BEGIN; SET LOCAL ROLE $R; SET LOCAL request.jwt.claims TO '{\"sub\":\"00000000-0000-4000-8000-000000000000\",\"role\":\"$R\"}'; SELECT public.expire_user_sessions(); ROLLBACK;" >/dev/null 2>&1; then
    echo "[FALHOU] $R executou expire_user_sessions"; exit 1
  fi
done
echo "[OK] privilegio: authenticated/anon negados (SET LOCAL ROLE em transacao, com request.jwt.claims)"

ROLLBACK="$(sed -n 's/^-- Rollback: //p' "$MIGRATION" | head -1)"
"${PSQL[@]}" -c "$ROLLBACK"
LEFT="$("${PSQL[@]}" -Atc "select (select count(*) from cron.job) + (select count(*) from pg_proc where proname='expire_user_sessions')")"
[ "$LEFT" = "0" ] || { echo "[FALHOU] rollback deixou resto: $LEFT"; exit 1; }
echo "[OK] rollback remove funcao e job"
echo "[PASSOU] user-sessions-expire"
