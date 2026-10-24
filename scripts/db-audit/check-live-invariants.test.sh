#!/usr/bin/env bash
# Prova, num PostgreSQL descartavel, que a guarda geral de invariantes do banco
# vivo scripts/db-audit/check-live-invariants.sql:
#   (a) NAO e vacua — cada invariante (RLS, security_invoker, matview exposta,
#       SECURITY DEFINER sem search_path, policy de escrita aberta, referencia
#       pendurada em funcao e em cron) bloqueia o estado ruim e cita o objeto;
#   (b) nao e frouxa — o que esta fora do escopo (policy de LEITURA aberta,
#       escrita so para service_role, comentario/literal com nome parecido)
#       continua verde;
#   (c) e fail-closed contra alvo errado (public sem tabela/view/SECURITY DEFINER
#       nao produz "OK" com cobertura zero);
#   (d) a allowlist de escrita esta documentada no proprio arquivo.
# O alvo e um banco limpo montado aqui; cada mutacao aplica, exige o bloqueio,
# desfaz e exige verde de novo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
guard_sql="$repo_root/scripts/db-audit/check-live-invariants.sql"
container_name="zapp-v2-live-invariants-test-$$"
postgres_image="${LIVE_INVARIANTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-live-invariants-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

wait_for_postgres() {
  local attempt logs
  for attempt in $(seq 1 60); do
    logs="$(docker logs "$container_name" 2>&1 || true)"
    if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
      docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

run_guard() {
  local output_var="$1" status_var="$2" guard_output guard_status
  set +e
  guard_output="$(psql_file "$guard_sql" 2>&1)"
  guard_status=$?
  set -e
  printf -v "$output_var" '%s' "$guard_output"
  printf -v "$status_var" '%s' "$guard_status"
}

assert_passes() {
  local label="$1" output status
  run_guard output status
  if (( status != 0 )) || [[ "$output" != *'INV-LIVE OK'* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria passar"
  fi
  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

# assert_blocks <rotulo> <trecho esperado na saida>...
assert_blocks() {
  local label="$1" output status expected
  shift
  run_guard output status
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria ser bloqueado"
  fi
  for expected in "$@"; do
    if [[ "$output" != *"$expected"* ]]; then
      printf '%s\n' "$output" >&2
      fail "$label: saida da guarda nao cita '$expected'"
    fi
  done
  ((passed += 1))
  printf '[PASS] %s (bloqueado com status %s)\n' "$label" "$status"
}

# mutacao temporaria: aplica, exige bloqueio, desfaz e exige verde de novo
assert_mutation_blocked() {
  local label="$1" apply_sql="$2" undo_sql="$3"
  shift 3
  psql_sql "$apply_sql" >/dev/null
  assert_blocks "$label" "$@"
  psql_sql "$undo_sql" >/dev/null
  assert_passes "$label: verde depois de desfazer"
}

# mutacao que NAO deve ser bloqueada (esta fora do escopo da guarda)
assert_mutation_allowed() {
  local label="$1" apply_sql="$2" undo_sql="$3"
  psql_sql "$apply_sql" >/dev/null
  assert_passes "$label"
  psql_sql "$undo_sql" >/dev/null
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$guard_sql" ]] || fail "guarda nao encontrada: $guard_sql"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=live_inv_test_only "$postgres_image" >/dev/null
wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

psql_sql "
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
" >/dev/null

# (d) a allowlist de escrita esta documentada no proprio arquivo da guarda.
if ! grep -q 'v_allowlist_escrita' "$guard_sql"; then
  fail 'a guarda nao declara a allowlist v_allowlist_escrita (documentacao ausente)'
fi
((passed += 1))
printf '[PASS] allowlist de escrita documentada no arquivo da guarda\n'

# (c) fail-closed: sem tabela em public nao ha "OK" com cobertura zero.
assert_blocks 'public sem tabela nao e aceito como OK' 'alvo errado'

# Banco alvo limpo: 1 tabela com RLS, 1 view com security_invoker, 1 SECURITY
# DEFINER com search_path fixo, 1 funcao que cita objeto EXISTENTE.
psql_sql "
  CREATE TABLE public.t_base (id int PRIMARY KEY);
  ALTER TABLE public.t_base ENABLE ROW LEVEL SECURITY;
  CREATE VIEW public.v_ok WITH (security_invoker = true) AS SELECT 1 AS x;
  CREATE FUNCTION public.f_ok() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS 'SELECT 1';
  CREATE FUNCTION public.f_usa_existente() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS 'SELECT public.f_ok()';
" >/dev/null

# (c) demais guardas de vacuidade: sem view e sem SECURITY DEFINER.
assert_blocks_sem_view() {
  local output status
  psql_sql "DROP VIEW public.v_ok" >/dev/null
  run_guard output status
  if (( status == 0 )) || [[ "$output" != *'nenhuma view'* ]]; then
    printf '%s\n' "$output" >&2
    fail 'public sem view deveria bloquear'
  fi
  ((passed += 1))
  printf '[PASS] public sem view nao e aceito como OK\n'
  psql_sql "CREATE VIEW public.v_ok WITH (security_invoker = true) AS SELECT 1 AS x" >/dev/null
}
assert_blocks_sem_view

assert_passes 'estado limpo passa'

# ── (a) nao vacua: cada invariante bloqueia o estado ruim ─────────────────────
assert_mutation_blocked 'tabela sem RLS e bloqueada e nomeada' \
  'CREATE TABLE public.t_sem_rls (id int)' \
  'DROP TABLE public.t_sem_rls' \
  'public.t_sem_rls'

assert_mutation_blocked 'view sem security_invoker e bloqueada e nomeada' \
  'CREATE VIEW public.v_sem_invoker AS SELECT 1' \
  'DROP VIEW public.v_sem_invoker' \
  'public.v_sem_invoker'

assert_mutation_blocked 'view com security_invoker=false e bloqueada' \
  'CREATE VIEW public.v_invoker_false WITH (security_invoker = false) AS SELECT 1' \
  'DROP VIEW public.v_invoker_false' \
  'public.v_invoker_false'

assert_mutation_blocked 'matview legivel por authenticated e bloqueada e nomeada' \
  'CREATE MATERIALIZED VIEW public.mv_vaza AS SELECT 1 AS x; GRANT SELECT ON public.mv_vaza TO authenticated' \
  'DROP MATERIALIZED VIEW public.mv_vaza' \
  'public.mv_vaza'

assert_mutation_blocked 'SECURITY DEFINER sem search_path e bloqueada e nomeada' \
  'CREATE FUNCTION public.f_sem_sp() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$SELECT 1$$' \
  'DROP FUNCTION public.f_sem_sp()' \
  'public.f_sem_sp()'

assert_mutation_blocked 'policy de escrita ALL true para authenticated e bloqueada' \
  'CREATE POLICY p_aberta ON public.t_base FOR ALL TO authenticated USING (true) WITH CHECK (true)' \
  'DROP POLICY p_aberta ON public.t_base' \
  'public.t_base: policy p_aberta'

assert_mutation_blocked 'policy de INSERT true para PUBLIC e bloqueada' \
  'CREATE POLICY p_ins_publica ON public.t_base FOR INSERT TO PUBLIC WITH CHECK (true)' \
  'DROP POLICY p_ins_publica ON public.t_base' \
  'public.t_base: policy p_ins_publica'

assert_mutation_blocked 'policy de escrita true para role herdada por authenticated e bloqueada' \
  'CREATE ROLE zz_pai NOLOGIN; GRANT zz_pai TO authenticated; CREATE POLICY p_herdada ON public.t_base FOR ALL TO zz_pai USING (true) WITH CHECK (true)' \
  'DROP POLICY p_herdada ON public.t_base; DROP ROLE zz_pai' \
  'public.t_base: policy p_herdada'

# allowlist POR POLICY: a excecao documentada passa, mas uma policy aberta NOVA na
# MESMA tabela continua reprovando (a excecao e a policy, nao a tabela).
psql_sql "
  CREATE TABLE public.department_invites (id int);
  ALTER TABLE public.department_invites ENABLE ROW LEVEL SECURITY;
  CREATE POLICY dept_invites_insert_authenticated ON public.department_invites
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY dept_invites_delete_authenticated ON public.department_invites
    FOR DELETE TO authenticated USING (true);
" >/dev/null
output=''; status=0
run_guard output status
if (( status != 0 )); then
  printf '%s\n' "$output" >&2
  fail 'a allowlist documentada deveria deixar passar'
fi
((passed += 1))
printf '[PASS] policy da allowlist documentada passa\n'

assert_mutation_blocked 'policy aberta NOVA na mesma tabela allowlistada ainda reprova' \
  'CREATE POLICY p_extra ON public.department_invites FOR UPDATE TO authenticated USING (true)' \
  'DROP POLICY p_extra ON public.department_invites' \
  'public.department_invites: policy p_extra'
psql_sql "DROP TABLE public.department_invites" >/dev/null

assert_mutation_blocked 'funcao citando objeto inexistente e bloqueada e nomeada' \
  "SET check_function_bodies = false; CREATE FUNCTION public.f_ref() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS 'SELECT public.zz_inexistente()'" \
  'DROP FUNCTION public.f_ref()' \
  'public.f_ref() -> public.zz_inexistente'

# cron.job: schema cron nao existe por padrao no container; cria um minimo.
psql_sql "
  CREATE SCHEMA cron;
  CREATE TABLE cron.job (jobid int PRIMARY KEY, jobname text, command text);
" >/dev/null

assert_mutation_blocked 'comando de cron citando funcao inexistente e bloqueado' \
  "INSERT INTO cron.job (jobid, jobname, command) VALUES (1, 'job_zz', 'SELECT public.zz_cron_inexistente()')" \
  'DELETE FROM cron.job WHERE jobid = 1' \
  'cron job_zz -> public.zz_cron_inexistente'

# ── (b) fora do escopo: continua verde ────────────────────────────────────────
assert_mutation_allowed 'policy de LEITURA aberta (USING true) nao e do escopo' \
  'CREATE POLICY p_leitura ON public.t_base FOR SELECT TO authenticated USING (true)' \
  'DROP POLICY p_leitura ON public.t_base'

assert_mutation_allowed 'escrita true so para service_role nao e do escopo' \
  'CREATE POLICY p_service ON public.t_base FOR ALL TO service_role USING (true) WITH CHECK (true)' \
  'DROP POLICY p_service ON public.t_base'

assert_mutation_allowed 'comentario e literal com nome parecido nao geram falso positivo' \
  "CREATE FUNCTION public.f_ruido() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS \$\$
     BEGIN
       -- SELECT public.zz_so_comentario()
       RETURN 'public.zz_so_literal(';
     END
   \$\$" \
  'DROP FUNCTION public.f_ruido()'

assert_mutation_allowed 'matview sem grant para anon/authenticated fica fora' \
  'CREATE MATERIALIZED VIEW public.mv_ok AS SELECT 1 AS x' \
  'DROP MATERIALIZED VIEW public.mv_ok'

assert_passes 'estado final limpo passa'

printf 'Invariantes do banco vivo (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
