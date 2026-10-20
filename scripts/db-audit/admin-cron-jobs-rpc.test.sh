#!/usr/bin/env bash
# t_ac2fa555 (paridade global admin, 11/10/2026): o painel admin do V3 lista os jobs
# do pg_cron e liga/desliga os da propria aplicacao. No V2 nao havia RPC: nada acessava
# cron.job/cron.job_run_details e nao havia caminho de escrita.
#
# A migration 20261011173000_admin_cron_jobs.sql cria:
#   public.admin_cron_jobs_permitidos()          -> text[]   (lista unica dos tocaveis)
#   public.admin_list_cron_jobs()                -> tabela   (nome/agenda/ativo/ultima)
#   public.admin_toggle_cron_job(text, boolean)  -> jsonb    (liga/desliga + auditoria)
# As duas RPCs nascem SECURITY DEFINER, com search_path fixo e guarda is_admin(auth.uid()).
#
# ESTE CONTRATO roda em PostgreSQL 17 descartavel (docker), no formato do irmao
# department-whatsapp-mode-rpc.test.sh (ANTES/DEPOIS + MUTACOES em copia temporaria,
# expect_error/check_error, um banco so). NENHUMA credencial de producao entra aqui.
#
#   ANTES   — sem a migration, as tres funcoes nao existem (to_regprocedure nulo).
#   DEPOIS  — aplica o ARQUIVO REAL e prova, com papel real (authenticated/anon) e stub
#             de cron.alter_job (o real pertence a supabase_admin; o local nao o expoe):
#             admin lista so os jobs da aplicacao (manutencao/limpeza fora), a ultima
#             execucao aparece, anon/agente/sem JWT levam 42501, job de manutencao e
#             nome desconhecido levam 22023, toggle e idempotente, altera cron.job
#             preservando o jobid e grava auditoria em public.audit_logs.
#   MUTACAO A — GRANT do list passa a anon: o contrato FALHA (anon leria a agenda).
#   MUTACAO B — allow-list ganha 'vacuum-contacts-daily': o contrato FALHA (manutencao
#               passaria a ser desligavel).
#   MUTACAO C — guarda vira `IF FALSE`: o contrato FALHA (agente passaria).
#
# Uso: bash scripts/db-audit/admin-cron-jobs-rpc.test.sh
#      ADMIN_CRON_JOBS_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011173000_admin_cron_jobs.sql"
postgres_image="${ADMIN_CRON_JOBS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-admin-cron-jobs-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-admin-cron-jobs-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-admin-cron-jobs-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-admin-cron-jobs-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

psql_q()    { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

# Erro esperado de TOPO: qualquer desvio encerra o teste.
expect_error() {
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o erro '$message'"; }
  ok "$label"
}

assert_eq() { # fase label esperado obtido
  local fase="$1" label="$2" expected="$3" actual="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '[OK] %s: %s = %s\n' "$fase" "$label" "$actual"
    return 0
  fi
  printf '[FAIL] %s: %s deveria ser %s, obtido %s\n' "$fase" "$label" "$expected" "$actual" >&2
  return 1
}

check_error() { # label mensagem sql
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '[FAIL] %s: a chamada passou (esperava %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  if [[ "$out" != *"$message"* ]]; then
    printf '[FAIL] %s: erro divergente (esperava %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  printf '[OK] %s\n' "$label"
  return 0
}

ADMIN_SUB='20000000-0000-0000-0000-0000000000a1'
AGENT_SUB='20000000-0000-0000-0000-0000000000a2'
SIG_LIST='public.admin_list_cron_jobs()'
SIG_TOGGLE='public.admin_toggle_cron_job(text,boolean)'
SIG_HELPER='public.admin_cron_jobs_permitidos()'
REVOKE_LIST_LINE='REVOKE ALL ON FUNCTION public.admin_list_cron_jobs()'
GRANT_LIST_LINE='GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated;'

admin_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
agent_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$AGENT_SUB';"
anon_call="BEGIN; SET LOCAL ROLE anon; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
noauth_call="BEGIN; SET LOCAL ROLE authenticated;"

checa_contrato() { # fase  -> 0 se TODAS as assercoes passam, 1 na primeira violacao
  local fase="$1" result
  # listagem: so os jobs da aplicacao
  assert_eq "$fase" 'admin lista os jobs da aplicacao' '4' \
    "$(psql_q -c "$admin_call SELECT count(*) FROM public.admin_list_cron_jobs(); COMMIT;")" || return 1
  assert_eq "$fase" 'manutencao/limpeza fora da listagem' '0' \
    "$(psql_q -c "$admin_call SELECT count(*) FROM public.admin_list_cron_jobs() WHERE jobname IN ('cleanup-link-preview-cache','vacuum-contacts-daily'); COMMIT;")" || return 1
  assert_eq "$fase" 'ultima execucao do job aparece' 'succeeded' \
    "$(psql_q -c "$admin_call SELECT last_status FROM public.admin_list_cron_jobs() WHERE jobname='talkx-scheduler-1min'; COMMIT;")" || return 1
  # ACL
  assert_eq "$fase" "has_function_privilege(authenticated, $SIG_LIST, EXECUTE)" 't' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_LIST','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(anon, $SIG_LIST, EXECUTE)" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('anon','$SIG_LIST','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(service_role, $SIG_LIST, EXECUTE)" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('service_role','$SIG_LIST','EXECUTE')")" || return 1
  assert_eq "$fase" "helper sem EXECUTE para authenticated" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_HELPER','EXECUTE')")" || return 1
  # quem nao pode
  check_error "$fase: anon e barrado pela ACL (42501)" '42501' \
    "$anon_call SELECT public.admin_list_cron_jobs(); COMMIT;" || return 1
  check_error "$fase: agente e barrado pela guarda (42501)" '42501' \
    "$agent_call SELECT public.admin_list_cron_jobs(); COMMIT;" || return 1
  check_error "$fase: sem JWT e barrado pela guarda (42501)" '42501' \
    "$noauth_call SELECT public.admin_list_cron_jobs(); COMMIT;" || return 1
  check_error "$fase: agente nao faz toggle (42501)" '42501' \
    "$agent_call SELECT public.admin_toggle_cron_job('talkx-scheduler-1min', true); COMMIT;" || return 1
  # allow-list: manutencao (existe em cron.job) e desconhecido
  check_error "$fase: job de manutencao recusado (22023)" '22023' \
    "$admin_call SELECT public.admin_toggle_cron_job('vacuum-contacts-daily', false); COMMIT;" || return 1
  check_error "$fase: job desconhecido recusado (22023)" '22023' \
    "$admin_call SELECT public.admin_toggle_cron_job('nao-existe-esse-job', false); COMMIT;" || return 1
  # caminho de sucesso: idempotencia + alteracao real + jobid preservado
  assert_eq "$fase" 'toggle no-op e idempotente' 'false' \
    "$(psql_q -c "$admin_call SELECT (public.admin_toggle_cron_job('talkx-scheduler-1min', false))->>'alterado'; COMMIT;")" || return 1
  assert_eq "$fase" 'toggle altera o estado' 'true' \
    "$(psql_q -c "$admin_call SELECT (public.admin_toggle_cron_job('talkx-scheduler-1min', true))->>'alterado'; COMMIT;")" || return 1
  assert_eq "$fase" 'cron.job.active mudou para t' 't' \
    "$(psql_q -c "SELECT active FROM cron.job WHERE jobname='talkx-scheduler-1min'")" || return 1
  assert_eq "$fase" 'jobid preservado (alter_job, nao recria)' '6' \
    "$(psql_q -c "SELECT jobid FROM cron.job WHERE jobname='talkx-scheduler-1min'")" || return 1
  # auditoria
  assert_eq "$fase" 'auditoria gravada' 't' \
    "$(psql_q -c "SELECT count(*) >= 2 FROM public.audit_logs WHERE action='admin_cron_job_toggle' AND entity_type='cron_job'")" || return 1
  return 0
}

exige_falha_do_contrato() { # fase
  local fase="$1" evid
  evid="$( ( checa_contrato "$fase" ) 2>&1 || true )"
  if [[ "$evid" == *'[FAIL]'* ]]; then
    printf '%s\n' "$evid" | sed 's/^/[EVIDENCIA] /'
    return 0
  fi
  printf '%s\n' "$evid" >&2
  return 1
}

drop_funcoes() {
  psql_q -c "DROP FUNCTION IF EXISTS public.admin_toggle_cron_job(text, boolean);
             DROP FUNCTION IF EXISTS public.admin_list_cron_jobs();
             DROP FUNCTION IF EXISTS public.admin_cron_jobs_permitidos();" >/dev/null
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

# ── leitura estatica do arquivo do repo (afirmacao grep -F, nunca contagem) ───
grep -qF "$REVOKE_LIST_LINE" "$migration" || fail 'o repo perdeu o REVOKE do list'
grep -qF "$GRANT_LIST_LINE" "$migration" || fail 'o repo perdeu o GRANT do list para authenticated'
grep -qF 'cron.alter_job(job_id := v_jobid, active := p_ativo)' "$migration" ||
  fail 'o repo perdeu o uso de cron.alter_job (nao pode virar DML direto em cron.job)'
grep -qF "IF NOT public.is_admin(auth.uid()) THEN" "$migration" ||
  fail 'o repo perdeu a guarda is_admin'
grep -qF "INSERT INTO public.audit_logs" "$migration" || fail 'o repo perdeu a auditoria'
ok 'o arquivo do repo tem REVOKE/GRANT, alter_job, guarda e auditoria (o teste so le)'

mkdir -p "$tmp_dir"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=admin_cron_jobs_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if psql_q -c 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || { printf 'FAIL: PostgreSQL de teste não iniciou\n' >&2; exit 1; }

# ── bootstrap: schema minimo + stub do pg_cron + seeds ────────────────────────
# cron.alter_job REAL pertence a supabase_admin (postgres local nao tem EXECUTE); aqui
# entra um stub com a MESMA assinatura, dono postgres, que so muda `active` na linha —
# e o suficiente para exercitar o codigo real da RPC num banco descartavel.
cat > "$tmp_dir/bootstrap.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid    bigint PRIMARY KEY,
  schedule text NOT NULL,
  command  text NOT NULL,
  nodename text NOT NULL DEFAULT 'localhost',
  nodeport integer NOT NULL DEFAULT 5432,
  database text NOT NULL DEFAULT 'postgres',
  username text NOT NULL DEFAULT 'postgres',
  active   boolean NOT NULL DEFAULT true,
  jobname  text
);
CREATE TABLE cron.job_run_details (
  jobid          bigint,
  runid          bigint DEFAULT 0,
  status         text,
  return_message text,
  start_time     timestamptz,
  end_time       timestamptz
);
CREATE FUNCTION cron.alter_job(
  job_id   bigint,
  schedule text DEFAULT NULL,
  command  text DEFAULT NULL,
  database text DEFAULT NULL,
  username text DEFAULT NULL,
  active   boolean DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cron.job AS j
    SET active = coalesce(alter_job.active, j.active)
    WHERE j.jobid = alter_job.job_id;
  RETURN FOUND;
END;
$$;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('20000000-0000-0000-0000-0000000000a2', 'agent');

-- jobs: 4 da aplicacao (na allow-list) + 2 fora (limpeza e manutencao, existentes)
INSERT INTO cron.job (jobid, schedule, command, active, jobname) VALUES
  (6,  '* * * * *',   'SELECT public.trigger_talkx_engine_tick()', false, 'talkx-scheduler-1min'),
  (11, '* * * * *',   'SELECT public.notify_due_tasks()',          false, 'tasks-notify-due'),
  (15, '1-59 * * * *','SELECT public.trigger_ai_jobs_tick()',      false, 'ai-jobs-tick-1min'),
  (16, '0 12 * * *',  'SELECT public.notify_searchbox_budget()',   false, 'searchbox-budget-alert'),
  (1,  '0 3 * * *',   'SELECT public.cleanup_link_preview_cache()',false, 'cleanup-link-preview-cache'),
  (99, '0 4 * * *',   'VACUUM',                                    false, 'vacuum-contacts-daily');

INSERT INTO cron.job_run_details (jobid, runid, status, return_message, start_time, end_time)
VALUES (6, 100, 'succeeded', '', now() - interval '1 minute', now());
SQL

psql_file "$tmp_dir/bootstrap.sql" >/dev/null
ok 'bootstrap: roles, auth.uid(), stub cron.alter_job, is_admin, audit_logs e seeds'

echo
echo '── ANTES: sem a migration, as RPCs nao existem ─────────────────────────────'
v="$(psql_q -c "SELECT to_regprocedure('$SIG_LIST') IS NULL AND to_regprocedure('$SIG_TOGGLE') IS NULL")"
[[ "$v" == t ]] || fail "ANTES: as RPCs ja existiam antes da migration (v=$v)"
ok 'ANTES: public.admin_list_cron_jobs e public.admin_toggle_cron_job ainda nao existem'

echo
echo '── DEPOIS: aplicando o SQL real da migration ─────────────────────────────'
psql_file "$migration" >/dev/null
if ! checa_contrato 'DEPOIS'; then
  fail 'DEPOIS: o contrato deveria passar com a migration aplicada'
fi
ok 'DEPOIS: o contrato inteiro passa com a migration aplicada'

echo
echo '── MUTACAO A: GRANT do list passa a anon (arquivo do repo intacto) ─────────'
mut_a="$tmp_dir/mut_a_grant_anon.sql"
sed 's|GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated;|GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated, anon;|' \
  "$migration" > "$mut_a"
grep -qF 'TO authenticated, anon;' "$mut_a" || fail 'MUTACAO A: a copia nao aplicou a abertura para anon'
grep -qF "$GRANT_LIST_LINE" "$mut_a" && fail 'MUTACAO A: a copia ainda tem o GRANT so para authenticated'
grep -qF "$GRANT_LIST_LINE" "$migration" || fail 'MUTACAO A: o arquivo do repo foi alterado'
drop_funcoes
psql_file "$mut_a" >/dev/null
if exige_falha_do_contrato 'MUTACAO A'; then
  ok 'MUTACAO A: com o GRANT para anon o contrato FALHA como esperado'
else
  fail 'MUTACAO A: o contrato passou -- a negativa de anon nao esta coberta'
fi

echo
echo '── MUTACAO B: allow-list ganha vacuum-contacts-daily (repo intacto) ────────'
mut_b="$tmp_dir/mut_b_allowlist.sql"
sed "s|'searchbox-budget-alert',|'vacuum-contacts-daily',\n    'searchbox-budget-alert',|" "$migration" > "$mut_b"
grep -qF "'vacuum-contacts-daily'," "$mut_b" || fail 'MUTACAO B: a copia nao inseriu o job de manutencao'
drop_funcoes
psql_file "$mut_b" >/dev/null
if exige_falha_do_contrato 'MUTACAO B'; then
  ok 'MUTACAO B: com manutencao na allow-list o contrato FALHA como esperado'
else
  fail 'MUTACAO B: o contrato passou -- a exclusao de manutencao nao esta coberta'
fi

echo
echo '── MUTACAO C: guarda vira IF FALSE (repo intacto) ──────────────────────────'
mut_c="$tmp_dir/mut_c_sem_guarda.sql"
sed 's|IF NOT public.is_admin(auth.uid()) THEN|IF FALSE THEN|g' "$migration" > "$mut_c"
grep -qF 'IF FALSE THEN' "$mut_c" || fail 'MUTACAO C: a copia nao removeu a guarda'
grep -qF 'IF NOT public.is_admin(auth.uid()) THEN' "$migration" || fail 'MUTACAO C: o arquivo do repo foi alterado'
drop_funcoes
psql_file "$mut_c" >/dev/null
if exige_falha_do_contrato 'MUTACAO C'; then
  ok 'MUTACAO C: sem a guarda o contrato FALHA como esperado (agente passaria)'
else
  fail 'MUTACAO C: o contrato passou -- a guarda de papel nao esta coberta'
fi

echo
printf '[OK] contrato t_ac2fa555 (RPCs do painel admin de cron jobs) verificado: %s assercoes (%s)\n' \
  "$passed" "$postgres_image"
