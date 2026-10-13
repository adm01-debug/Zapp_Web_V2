#!/usr/bin/env bash
# PE-108 / SL-231 — coletor de Web Vitals no servidor (tabela public.web_vitals_samples
# + RPC public.record_web_vital + retencao public.purge_web_vitals_samples).
#
# Prova com os PAPEIS REAIS (authenticated, anon, service_role) em PostgreSQL 17
# descartavel — nada de service_role/BYPASSRLS como prova unica: aqui
# `SET ROLE authenticated`/`anon` sao roles de verdade sem BYPASSRLS, entao toda
# leitura passa pelo enforcement do PostgREST.
#
# O que este teste faz:
#   1. Recria o schema minimo (roles, auth.uid/role, stub do pg_cron, user_roles +
#      app_role) e EXTRAI a funcao is_admin verbatim da migration de origem.
#   2. Aplica migrations REAIS: a de edge_rate_limits (fonte do rate limit) e a
#      propria 20261013230010_web_vitals_samples.sql.
#   3. Prova: fronteira de EXECUTE e de GRANT (anon nao executa nem le; authenticated
#      nao escreve direto), gravacao pela RPC com rota normalizada, validacao por
#      amostra (metric/value/route/app_version) recusando o lote inteiro, rate limit
#      por usuario, leitura so para admin, retencao de 30 dias, job do cron e, por
#      fim, que a linha `-- Rollback:` da migration desfaz tudo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="${WEB_VITALS_TEST_MIGRATIONS_DIR:-$repo_root/supabase/migrations}"
postgres_image="${WEB_VITALS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-web-vitals-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-web-vitals-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

mig_rate_limits="20260905020000_edge_rate_limits.sql"
mig_is_admin="20260830080000_fn_is_admin_and_fix_permissions_rls.sql"
mig_web_vitals="20261013230010_web_vitals_samples.sql"
for f in "$mig_rate_limits" "$mig_is_admin" "$mig_web_vitals"; do
  [[ -f "$migrations_dir/$f" ]] || fail "migration nao encontrada: $f"
done

# Guarda de vigencia da RPC/tabela testadas: nenhuma migration posterior pode
# redefinir web_vitals_samples/record_web_vital/purge_web_vitals_samples.
migrations_sorted="$(cd "$migrations_dir" && ls -1 *.sql | sort)"
later="$(awk -v o="$mig_web_vitals" '$0==o{seen=1; next} seen{print}' <<< "$migrations_sorted" \
  | while read -r rel; do
      if grep -qiE 'web_vitals_samples|record_web_vital|purge_web_vitals_samples' "$migrations_dir/$rel"; then printf '%s ' "$rel"; fi
    done)"
[[ -z "$later" ]] || fail "guarda de vigencia: objeto redefinido depois de $mig_web_vitals em: $later"
printf '[PASS] vigencia: nenhum arquivo posterior a %s redefine os objetos testados\n' "$mig_web_vitals"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Schema minimo: roles, auth.*, stub do pg_cron, user_roles ─────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, anon, service_role;

-- Stub do pg_cron: guarda os jobs numa tabela para o teste provar o agendamento
-- e o rollback (cron.unschedule). Nao executa nada.
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_jobid bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  RETURNING jobid INTO v_jobid;
  RETURN v_jobid;
END $$;
CREATE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM cron.job WHERE jobname = job_name;
  RETURN true;
END $$;

-- app_role/user_roles estao aqui porque is_admin (extraido verbatim) le
-- user_roles; sao stub minimo, o contrato testado e o web_vitals.
CREATE TYPE app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);
SQL
psql_file "$tmp_dir/pre.sql"

# ── is_admin verbatim da migration de origem (mesma trava de vigencia) ────────
extract_between() { # $1=literal da linha inicial, $2=literal contido na linha final, $3=arquivo, $4=saida
  awk -v s="$1" -v e="$2" 'index($0, s) {on=1} on {print} on && index($0, e) {exit}' "$3" > "$4"
  [[ -s "$4" ]] || fail "extracao vazia em $3 a partir de '$1'"
}
extract_between 'CREATE OR REPLACE FUNCTION public.is_admin' '$$;' \
  "$migrations_dir/$mig_is_admin" "$tmp_dir/is_admin.sql"
grep -q 'CREATE OR REPLACE FUNCTION public.is_admin' "$tmp_dir/is_admin.sql" \
  || fail 'extracao de is_admin veio vazia'
# ACL de producao: o Supabase concede EXECUTE a anon/authenticated/service_role
# no momento em que a funcao nasce (default privileges); a 20260903260000 revoga
# de PUBLIC e anon — authenticated e service_role seguem com EXECUTE explicito,
# e e o que faz as policies com is_admin(auth.uid()) funcionarem para o cliente.
printf '\nGRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;\n' >> "$tmp_dir/is_admin.sql"
printf '\nREVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;\n' >> "$tmp_dir/is_admin.sql"
psql_file "$tmp_dir/is_admin.sql" || fail 'falha ao aplicar is_admin extraido'

# ── Migrations REAIS ──────────────────────────────────────────────────────────
psql_file "$migrations_dir/$mig_rate_limits" >/dev/null || fail "falha ao aplicar $mig_rate_limits"
psql_file "$migrations_dir/$mig_web_vitals" >/dev/null || fail "falha ao aplicar $mig_web_vitals"

# Fixtures: admin e 3 agentes (agent2 para o rate limit, agent3 para o controle).
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'agent'),
  ('33333333-3333-3333-3333-333333333333', 'agent'),
  ('44444444-4444-4444-4444-444444444444', 'agent');
SQL
psql_file "$tmp_dir/seed.sql"

ADMIN_JWT='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
AGENT_JWT='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
AGENT2_JWT='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
AGENT3_JWT='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'

as_admin()  { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN_JWT" "$1"; }
as_agent()  { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT_JWT" "$1"; }
as_agent2() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT2_JWT" "$1"; }
as_agent3() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT3_JWT" "$1"; }
as_anon()   { printf "SET ROLE anon; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT_JWT" "$1"; }

P_OK='[{"metric":"LCP","value":1234.5,"route":"/contatos?page=2#top","app_version":"2.1.0"},{"metric":"CLS","value":0.12,"route":"/"}]'

echo '── BLOCO A: fronteira de EXECUTE e de GRANT (nada privilegiado) ─────────────'

expect_error 'A1 anon nao executa record_web_vital' \
  'permission denied for function record_web_vital' \
  "$(as_anon "SELECT public.record_web_vital('[]'::jsonb);")"
expect_error 'A2 authenticated sem JWT falha fechado (not_authenticated)' \
  'not_authenticated' \
  "SET ROLE authenticated; SELECT public.record_web_vital('$P_OK'::jsonb);"
expect_error 'A3 anon nao le a tabela (sem GRANT)' \
  'permission denied for table web_vitals_samples' \
  "$(as_anon 'SELECT count(*) FROM public.web_vitals_samples;')"
expect_error 'A4 authenticated nao escreve direto na tabela (so pela RPC)' \
  'permission denied for table web_vitals_samples' \
  "$(as_agent "INSERT INTO public.web_vitals_samples (user_id, metric, value) VALUES (auth.uid(), 'LCP', 1000);")"
expect_value 'A5 authenticated tem SELECT e nao tem INSERT/UPDATE/DELETE' 'true false false false' \
  "SELECT has_table_privilege('authenticated','public.web_vitals_samples','SELECT') || ' ' ||
          has_table_privilege('authenticated','public.web_vitals_samples','INSERT') || ' ' ||
          has_table_privilege('authenticated','public.web_vitals_samples','UPDATE') || ' ' ||
          has_table_privilege('authenticated','public.web_vitals_samples','DELETE');"
expect_value 'A6 anon sem SELECT' 'f' \
  "SELECT has_table_privilege('anon','public.web_vitals_samples','SELECT');"
expect_value 'A7 RLS ligada na tabela' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE relname='web_vitals_samples';"

echo
echo '── BLOCO B: gravacao pela RPC com rota normalizada ──────────────────────────'

expect_value 'B1 agente grava lote de 2 via RPC' '2' \
  "$(as_agent "SELECT public.record_web_vital('$P_OK'::jsonb);")"
expect_value 'B2 rota normalizada (query string e fragmento cortados)' '/contatos' \
  "SELECT route FROM public.web_vitals_samples WHERE metric='LCP' ORDER BY created_at LIMIT 1;"
expect_value 'B3 app_version ausente vira default' 'unknown' \
  "SELECT app_version FROM public.web_vitals_samples WHERE metric='CLS' ORDER BY created_at LIMIT 1;"
expect_value 'B4 agent autenticado nao ve as amostras (RLS admin-only)' '0' \
  "$(as_agent 'SELECT count(*) FROM public.web_vitals_samples;')"
expect_value 'B5 admin ve as amostras' '2' \
  "$(as_admin 'SELECT count(*) FROM public.web_vitals_samples;')"

echo
echo '── BLOCO C: validacao por amostra recusa o lote inteiro ─────────────────────'

P_BAD_METRIC='[{"metric":"XXL","value":1}]'
P_BAD_CLS='[{"metric":"CLS","value":99}]'
P_NEGATIVE='[{"metric":"LCP","value":-1}]'
P_BAD_ROUTE='[{"metric":"LCP","value":10,"route":"contatos"}]'
P_BAD_VERSION='[{"metric":"LCP","value":10,"app_version":"v 1"}]'
P_NOT_ARRAY='{"metric":"LCP","value":10}'
P_MIXED='[{"metric":"LCP","value":10,"route":"/"},{"metric":"XXL","value":1}]'

expect_error 'C1 metrica fora do vocabulario recusada' 'invalid_sample' \
  "$(as_agent "SELECT public.record_web_vital('$P_BAD_METRIC'::jsonb);")"
expect_error 'C2 CLS acima da faixa (99) recusado' 'invalid_sample' \
  "$(as_agent "SELECT public.record_web_vital('$P_BAD_CLS'::jsonb);")"
expect_error 'C3 valor negativo recusado' 'invalid_sample' \
  "$(as_agent "SELECT public.record_web_vital('$P_NEGATIVE'::jsonb);")"
expect_error 'C4 rota sem barra inicial recusada' 'invalid_sample' \
  "$(as_agent "SELECT public.record_web_vital('$P_BAD_ROUTE'::jsonb);")"
expect_error 'C5 app_version com espaco recusado' 'invalid_sample' \
  "$(as_agent "SELECT public.record_web_vital('$P_BAD_VERSION'::jsonb);")"
expect_error 'C6 payload que nao e array recusado' 'invalid_samples' \
  "$(as_agent "SELECT public.record_web_vital('$P_NOT_ARRAY'::jsonb);")"
expect_error 'C7 lote acima de 50 recusado' 'invalid_samples_length' \
  "$(as_agent "SELECT public.record_web_vital((SELECT jsonb_agg(jsonb_build_object('metric','LCP','value',1,'route','/')) FROM generate_series(1,51)));")"

count_before="$(psql_sql 'SELECT count(*) FROM public.web_vitals_samples;')"
expect_error 'C8 lote com 1 amostra invalida recusado por inteiro' 'invalid_sample' \
  "$(as_agent "SELECT public.record_web_vital('$P_MIXED'::jsonb);")"
count_after="$(psql_sql 'SELECT count(*) FROM public.web_vitals_samples;')"
[[ "$count_before" == "$count_after" ]] || fail "C8 atomicidade: antes=$count_before depois=$count_after (gravou parcial)"
printf '[PASS] C8 atomicidade: nada gravado no lote invalido (antes=depois=%s)\n' "$count_after"

expect_value 'C9 lote vazio e no-op' '0' \
  "$(as_agent "SELECT public.record_web_vital('[]'::jsonb);")"

echo
echo '── BLOCO D: rate limit por usuario ─────────────────────────────────────────'

psql_sql 'DELETE FROM public.edge_rate_limits;' >/dev/null
P_ONE='[{"metric":"LCP","value":10,"route":"/"}]'
expect_value 'D1 30 chamadas passam, a 31a e descartada em silencio (0)' '1 30' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$AGENT2_JWT', false);
   SELECT count(*) FILTER (WHERE r = 0) || ' ' || count(*) FILTER (WHERE r = 1)
     FROM (SELECT public.record_web_vital('$P_ONE'::jsonb) AS r
             FROM generate_series(1,31)) t;"
expect_value 'D2 outro usuario nao e afetado pelo limite alheio' '1' \
  "$(as_agent3 "SELECT public.record_web_vital('$P_ONE'::jsonb);")"
expect_value 'D3 a chave do limite e por usuario' 't' \
  "SELECT EXISTS (SELECT 1 FROM public.edge_rate_limits WHERE key = 'web-vital:33333333-3333-3333-3333-333333333333');"

echo
echo '── BLOCO E: retencao de 30 dias ─────────────────────────────────────────────'

psql_sql "INSERT INTO public.web_vitals_samples (user_id, metric, value, route, app_version, sampled_on) VALUES
  ('22222222-2222-2222-2222-222222222222','LCP',1000,'/','unknown', ((now() at time zone 'utc')::date - 40)),
  ('22222222-2222-2222-2222-222222222222','CLS',0.1,'/','unknown', ((now() at time zone 'utc')::date - 31)),
  ('22222222-2222-2222-2222-222222222222','LCP',1000,'/','unknown', ((now() at time zone 'utc')::date));" >/dev/null

expect_value 'E1 purge(30 dias) apaga as 2 amostras vencidas' '2' \
  "SET ROLE service_role; SELECT public.purge_web_vitals_samples();"
expect_value 'E2 amostras antigas sumiram' '0' \
  "SELECT count(*) FROM public.web_vitals_samples WHERE sampled_on < ((now() at time zone 'utc')::date - 30);"
expect_value 'E3 p_keep nulo e fail closed (0 apagadas)' '0' \
  "SET ROLE service_role; SELECT public.purge_web_vitals_samples(NULL);"
expect_error 'E4 authenticated nao executa purge (service_role only)' \
  'permission denied for function purge_web_vitals_samples' \
  "$(as_agent 'SELECT public.purge_web_vitals_samples();')"

echo
echo '── BLOCO F: agendamento da retencao ─────────────────────────────────────────'

expect_value 'F1 job purge-web-vitals-samples agendado as 04:25 UTC' 'purge-web-vitals-samples 25 4 * * *' \
  "SELECT jobname || ' ' || schedule FROM cron.job WHERE jobname='purge-web-vitals-samples';"
expect_value 'F2 o comando do job chama a RPC de purga' 't' \
  "SELECT command LIKE '%purge_web_vitals_samples%' FROM cron.job WHERE jobname='purge-web-vitals-samples';"

echo
echo '── BLOCO G: a linha -- Rollback: da migration desfaz tudo ───────────────────'

sed -n '1,12p' "$migrations_dir/$mig_web_vitals" | grep '^--   ' | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback executavel da migration veio vazio'
printf 'rollback extraido:\n'; sed 's/^/  /' "$tmp_dir/rollback.sql"
psql_file "$tmp_dir/rollback.sql" >/dev/null || fail 'rollback da migration falhou'

expect_value 'G1 tabela removida' '0' \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='web_vitals_samples';"
expect_value 'G2 funcoes removidas' '0' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('record_web_vital','purge_web_vitals_samples');"
expect_value 'G3 job do cron desagendado' '0' \
  "SELECT count(*) FROM cron.job WHERE jobname='purge-web-vitals-samples';"

printf '\n[OK] contrato de web_vitals_samples, record_web_vital e retencao verificado com papeis reais\n'
