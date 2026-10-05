#!/usr/bin/env bash
# M-DB-02: prova, num PostgreSQL descartavel, que a guarda generica
# scripts/db-audit/check-secdef-public-execute.sql (a) bloqueia o estado anterior
# (record_incoming_call_event de 7 argumentos e o trigger do Talk X com EXECUTE para
# PUBLIC), (b) passa depois da migration real 20261004172554, (c) nao e vacua: cada
# forma de abrir EXECUTE a PUBLIC/anon numa SECURITY DEFINER de public e bloqueada e
# o que esta fora do escopo (INVOKER, outro schema, so authenticated) passa.
# Tambem prova o efeito da migration: so service_role executa a RPC, o overload de 6
# sumiu, funcao nova de postgres nasce sem PUBLIC e o trigger segue disparando.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
guard_sql="$repo_root/scripts/db-audit/check-secdef-public-execute.sql"
migration="$repo_root/supabase/migrations/20261004172554_fecha_record_incoming_call_event.sql"
container_name="zapp-v2-secdef-exec-test-$$"
postgres_image="${SECDEF_EXEC_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-secdef-exec-test-[0-9]+$ ]]; then
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
  if (( status != 0 )) || [[ "$output" != *'check-secdef-public-execute: OK'* ]]; then
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
}

expect_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=secdef_test_only "$postgres_image" >/dev/null
wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# Roles e default ACL do Supabase Cloud: postgres concede EXECUTE em public a
# authenticated e service_role (pg_default_acl por schema) e PUBLIC vem do global.
psql_sql "
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE ROLE outro_dono NOLOGIN;
  GRANT CREATE ON SCHEMA public TO outro_dono;
  CREATE SCHEMA outro;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
" >/dev/null

# Banco alvo sem nenhuma SECURITY DEFINER em public: fail-closed (alvo errado), nunca OK vacuo.
assert_blocks 'banco sem SECURITY DEFINER em public nao e aceito como OK' 'alvo errado'

# Estado anterior medido: overload de 6 fechado (20260922220000), overload de 7 criado
# pela T26 com o ACL padrao, trigger do Talk X com o ACL padrao.
psql_sql "
  CREATE TABLE public.talkx_campaigns (id serial PRIMARY KEY, name text);
  CREATE TABLE public.talkx_campaign_events (id serial PRIMARY KEY, campaign_id int);
  GRANT INSERT ON public.talkx_campaigns TO authenticated;
  GRANT USAGE ON SEQUENCE public.talkx_campaigns_id_seq TO authenticated;
  CREATE FUNCTION public.record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text,
      p_is_video boolean, p_provider_event_id text DEFAULT NULL, p_should_notify boolean DEFAULT false)
    RETURNS TABLE (call_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
    AS 'SELECT NULL::uuid';
  REVOKE ALL ON FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean) TO service_role;
  CREATE FUNCTION public.record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text,
      p_is_video boolean, p_provider_event_id text DEFAULT NULL, p_should_notify boolean DEFAULT false,
      p_direction text DEFAULT NULL)
    RETURNS TABLE (call_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
    AS 'SELECT NULL::uuid';
  CREATE FUNCTION public.record_talkx_campaign_lifecycle_event() RETURNS trigger LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public, pg_temp
    AS 'BEGIN INSERT INTO public.talkx_campaign_events (campaign_id) VALUES (NEW.id); RETURN NEW; END';
  CREATE TRIGGER record_talkx_campaign_lifecycle_event AFTER INSERT ON public.talkx_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.record_talkx_campaign_lifecycle_event();
" >/dev/null

assert_blocks 'estado anterior (T26 + trigger do Talk X) e bloqueado' \
  'record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text) [PUBLIC,anon]' \
  'record_talkx_campaign_lifecycle_event() [PUBLIC,anon]'

psql_file "$migration" >/dev/null
assert_passes 'migration 20261004172554 fecha as duas'

expect_eq 'RPC de 7 argumentos: anon f, authenticated f, service_role t' 'false|false|true' \
  "$(psql_sql "SELECT has_function_privilege('anon', p, 'EXECUTE')::text || '|' || has_function_privilege('authenticated', p, 'EXECUTE')::text || '|' || has_function_privilege('service_role', p, 'EXECUTE')::text FROM (SELECT 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text)'::regprocedure AS p) s")"
expect_eq 'overload de 6 argumentos removido' '' \
  "$(psql_sql "SELECT to_regprocedure('public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean)')")"
psql_sql "CREATE FUNCTION public.zz_nova() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'" >/dev/null
expect_eq 'funcao nova de postgres em public nasce sem PUBLIC/anon' 'false|false|true' \
  "$(psql_sql "SELECT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE proname = 'zz_nova')) a WHERE a.grantee = 0)::text
       || '|' || has_function_privilege('anon', 'public.zz_nova()', 'EXECUTE')::text
       || '|' || has_function_privilege('authenticated', 'public.zz_nova()', 'EXECUTE')::text")"
assert_passes 'funcao nova criada depois da migration'
psql_sql "SET ROLE authenticated; INSERT INTO public.talkx_campaigns (name) VALUES ('x')" >/dev/null
expect_eq 'trigger sem EXECUTE para authenticated continua disparando' 'false|1' \
  "$(psql_sql "SELECT has_function_privilege('authenticated', 'public.record_talkx_campaign_lifecycle_event()', 'EXECUTE')::text
       || '|' || (SELECT count(*) FROM public.talkx_campaign_events)::text")"

# Nao vacuo: cada caminho de EXECUTE para PUBLIC/anon numa SECURITY DEFINER de public.
assert_mutation_blocked 'GRANT direto a PUBLIC' \
  "CREATE FUNCTION public.zz_publica() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.zz_publica() TO PUBLIC" \
  'DROP FUNCTION public.zz_publica()' \
  'public.zz_publica() [PUBLIC,anon]'
assert_mutation_blocked 'GRANT direto a anon' \
  "CREATE FUNCTION public.zz_anon() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.zz_anon() TO anon" \
  'DROP FUNCTION public.zz_anon()' \
  'public.zz_anon() [anon]'
assert_mutation_blocked 'anon herda EXECUTE de outra role' \
  "CREATE ROLE zz_pai NOLOGIN; GRANT zz_pai TO anon; CREATE FUNCTION public.zz_herdada() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.zz_herdada() TO zz_pai" \
  'DROP FUNCTION public.zz_herdada(); DROP ROLE zz_pai' \
  'public.zz_herdada() [anon]'
assert_mutation_blocked 'ACL nulo (dono sem default ACL) conta como PUBLIC' \
  "SET ROLE outro_dono; CREATE FUNCTION public.zz_acl_nula() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'" \
  'DROP FUNCTION public.zz_acl_nula()' \
  'public.zz_acl_nula() [PUBLIC,anon]'
assert_mutation_blocked 'nova identidade por parametro a mais (classe da T26) com ACL padrao e bloqueada' \
  "SET ROLE outro_dono; CREATE FUNCTION public.record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean, p_direction text, p_extra text) RETURNS TABLE (call_id uuid) LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::uuid'" \
  'DROP FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text, text)' \
  'record_incoming_call_event(uuid,uuid,text,boolean,text,boolean,text,text) [PUBLIC,anon]'
assert_mutation_blocked 'trigger SECURITY DEFINER com PUBLIC tambem e bloqueado' \
  "GRANT EXECUTE ON FUNCTION public.record_talkx_campaign_lifecycle_event() TO PUBLIC" \
  'REVOKE EXECUTE ON FUNCTION public.record_talkx_campaign_lifecycle_event() FROM PUBLIC' \
  'record_talkx_campaign_lifecycle_event() [PUBLIC,anon]'

# Fora do escopo da guarda: continua verde.
psql_sql "
  CREATE FUNCTION public.zz_invoker() RETURNS int LANGUAGE sql SECURITY INVOKER AS 'SELECT 1';
  GRANT EXECUTE ON FUNCTION public.zz_invoker() TO PUBLIC;
  CREATE FUNCTION outro.zz_outro_schema() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
  GRANT EXECUTE ON FUNCTION outro.zz_outro_schema() TO PUBLIC;
  CREATE FUNCTION public.zz_so_authenticated() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
" >/dev/null
assert_passes 'INVOKER, outro schema e SECURITY DEFINER so de authenticated ficam fora'

printf 'SECURITY DEFINER x PUBLIC/anon (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
