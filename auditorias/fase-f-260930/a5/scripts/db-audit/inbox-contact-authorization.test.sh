#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
runtime_contract="$repo_root/scripts/db-audit/inbox-contact-authorization-runtime.sql"
postgres_image="${INBOX_AUTHZ_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-inbox-authz-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-inbox-authz-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_failure() {
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

psql_sql "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
  CREATE TABLE public.agent_visibility_grants (
    agent_id uuid NOT NULL REFERENCES public.profiles(id),
    can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id),
    PRIMARY KEY (agent_id, can_see_agent_id)
  );
  CREATE TABLE public.queues (id uuid PRIMARY KEY);
  CREATE TABLE public.contacts (
    id uuid PRIMARY KEY,
    assigned_to uuid REFERENCES public.profiles(id),
    queue_id uuid REFERENCES public.queues(id)
  );
  CREATE TABLE public.queue_members (
    queue_id uuid NOT NULL REFERENCES public.queues(id),
    profile_id uuid NOT NULL REFERENCES public.profiles(id),
    is_active boolean NOT NULL,
    PRIMARY KEY (queue_id, profile_id)
  );
  CREATE TABLE public.messages (
    id uuid PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    media_url text
  );
  CREATE TABLE public.conversation_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    status text
  );
  CREATE TABLE public.contact_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    content text NOT NULL
  );
  ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \$\$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 \$\$;
  CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \$\$ SELECT id FROM public.profiles WHERE user_id=_user_id \$\$;
  CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \$\$ SELECT _user_id='20000000-0000-0000-0000-000000000005'::uuid \$\$;
  CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \$\$ SELECT true \$\$;
  CREATE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
    RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \$\$ SELECT 0, 0, 0 \$\$;
  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT INSERT, UPDATE, DELETE ON public.contact_notes TO authenticated;
  CREATE POLICY legacy_notes_read_all ON public.contact_notes FOR SELECT TO authenticated USING (true);
  CREATE POLICY legacy_notes_write_any ON public.contact_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

  INSERT INTO public.profiles (id, user_id) VALUES
    ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005'),
    ('10000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000006');
  INSERT INTO public.user_roles VALUES
    ('20000000-0000-0000-0000-000000000004','special_agent');
  INSERT INTO public.agent_visibility_grants VALUES
    ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001');
  INSERT INTO public.queues VALUES ('50000000-0000-0000-0000-000000000001');
  INSERT INTO public.queue_members VALUES
    ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',true),
    ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006',false);
  INSERT INTO public.contacts VALUES
    ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
    ('30000000-0000-0000-0000-000000000002',NULL,NULL);
  INSERT INTO public.messages VALUES
    ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','object/path'),
    ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',NULL);
  INSERT INTO public.conversation_tasks (contact_id,status) VALUES
    ('30000000-0000-0000-0000-000000000001','pending'),
    ('30000000-0000-0000-0000-000000000001','completed');
  INSERT INTO public.contact_notes VALUES
    (gen_random_uuid(),'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner note'),
    (gen_random_uuid(),'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','hidden note');
" >/dev/null

psql_file "$migration" >/dev/null
runtime_json="$(psql_file "$runtime_contract")"
RUNTIME_JSON="$runtime_json" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RUNTIME_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.note_table_count === 1
  && proof.note_rls_enabled === true
  && proof.function_count === 4
  && proof.safe_function_count === 4
  && proof.definition_sha256 === '55078d2e365413bea0b93777ec63e70063def445760d0ae8f516670b86070771'
  && proof.caller_bound_count === 3
  && proof.rpc_authorized_count === 1
  && proof.policy_count === 4
  && proof.policy_signature_count === 4
  && proof.identity_trigger_count === 1
  && proof.authenticated_api_execute_count === 4
  && proof.anon_api_execute_count === 0
  && proof.guard_authenticated_execute === false
  && proof.guard_anon_execute === false
  && proof.anon_note_access === false
  && proof.authenticated_note_crud === true
  && proof.authenticated_note_extra === false
  && proof.service_note_crud === true
  && proof.service_note_extra === false;
if (!ok) {
  console.error('runtime contract divergente');
  process.exit(1);
}
console.log(`definition_sha256=${proof.definition_sha256}`);
NODE

[[ "$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='contact_notes'")" == '4' ]] || fail 'policies antigas sobreviveram'
[[ "$(psql_sql "SELECT relrowsecurity FROM pg_class WHERE oid='public.contact_notes'::regclass")" == 't' ]] || fail 'RLS de contact_notes nao esta habilitado'
[[ "$(psql_sql "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name IN ('get_profile_id_for_user','get_visible_agent_ids','is_contact_visible_to_user','get_conversation_tab_counts') AND grantee IN ('PUBLIC','anon')")" == '0' ]] || fail 'PUBLIC ou anon conservou EXECUTE'
[[ "$(psql_sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_profile_id_for_user','get_visible_agent_ids','is_contact_visible_to_user','get_conversation_tab_counts') AND p.prosecdef AND 'search_path=public, pg_temp'=ANY(p.proconfig)")" == '4' ]] || fail 'SECURITY DEFINER/search_path divergente'
[[ "$(psql_sql "SELECT has_table_privilege('anon','public.contact_notes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')")" == 'f' ]] || fail 'anon conservou acesso a contact_notes'
[[ "$(psql_sql "SELECT has_table_privilege('authenticated','public.contact_notes','SELECT') AND has_table_privilege('authenticated','public.contact_notes','INSERT') AND has_table_privilege('authenticated','public.contact_notes','UPDATE') AND has_table_privilege('authenticated','public.contact_notes','DELETE')")" == 't' ]] || fail 'authenticated perdeu CRUD necessario'
[[ "$(psql_sql "SELECT has_table_privilege('authenticated','public.contact_notes','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')")" == 'f' ]] || fail 'authenticated conservou privilegios extras'
[[ "$(psql_sql "SELECT has_table_privilege('service_role','public.contact_notes','SELECT') AND has_table_privilege('service_role','public.contact_notes','INSERT') AND has_table_privilege('service_role','public.contact_notes','UPDATE') AND has_table_privilege('service_role','public.contact_notes','DELETE')")" == 't' ]] || fail 'service_role perdeu CRUD necessario'
[[ "$(psql_sql "SELECT has_table_privilege('service_role','public.contact_notes','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')")" == 'f' ]] || fail 'service_role conservou privilegios extras'

for actor in 1 2 4 5; do
  user_id="20000000-0000-0000-0000-00000000000${actor}"
  result="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$user_id'; SELECT public.is_contact_visible_to_user('30000000-0000-0000-0000-000000000001','$user_id');")"
  [[ "$result" == 't' ]] || fail "ator autorizado $actor nao recebeu visibilidade (resultado=$result)"
done
for actor in 3 6; do
  user_id="20000000-0000-0000-0000-00000000000${actor}"
  result="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$user_id'; SELECT public.is_contact_visible_to_user('30000000-0000-0000-0000-000000000001','$user_id');")"
  [[ "$result" == 'f' ]] || fail "ator bloqueado $actor recebeu visibilidade"
done

[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'; SELECT * FROM public.get_conversation_tab_counts('30000000-0000-0000-0000-000000000001');")" == '1|1|1' ]] || fail 'RPC retornou contagens incorretas para membro de fila'

expect_failure 'RPC IDOR do outsider' "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; SELECT * FROM public.get_conversation_tab_counts('30000000-0000-0000-0000-000000000001');"
expect_failure 'RPC sem EXECUTE para anon' "SET ROLE anon; SELECT * FROM public.get_conversation_tab_counts('30000000-0000-0000-0000-000000000001');"

[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; SELECT public.is_contact_visible_to_user('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005');")" == 'f' ]] || fail 'outsider conseguiu impersonar admin no helper'
[[ -z "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; SELECT public.get_profile_id_for_user('20000000-0000-0000-0000-000000000001');")" ]] || fail 'outsider enumerou profile de outro usuario'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; SELECT count(*) FROM public.get_visible_agent_ids('20000000-0000-0000-0000-000000000004');")" == '0' ]] || fail 'outsider enumerou carteira de special agent'

psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'; INSERT INTO public.contact_notes (contact_id,author_id,content) VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','queue note'); UPDATE public.contact_notes SET content='queue note updated' WHERE author_id='10000000-0000-0000-0000-000000000002';" >/dev/null
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'; SELECT count(*) FROM public.contact_notes;")" == '2' ]] || fail 'membro de fila nao recebeu conjunto correto de notas'

expect_failure 'spoof de autor da nota' "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'; INSERT INTO public.contact_notes (contact_id,author_id,content) VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spoof');"
expect_failure 'nota em contato oculto' "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; INSERT INTO public.contact_notes (contact_id,author_id,content) VALUES ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','hidden');"
expect_failure 'movimento de nota entre contatos' "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'; UPDATE public.contact_notes SET contact_id='30000000-0000-0000-0000-000000000002' WHERE author_id='10000000-0000-0000-0000-000000000002';"
expect_failure 'trigger bloqueia identidade mesmo com bypass RLS' "UPDATE public.contact_notes SET author_id='10000000-0000-0000-0000-000000000003' WHERE author_id='10000000-0000-0000-0000-000000000002';"

[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; SELECT count(*) FROM public.contact_notes;")" == '0' ]] || fail 'outsider leu notas ocultas'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000005'; SELECT count(*) FROM public.contact_notes;")" == '3' ]] || fail 'admin nao recebeu leitura global'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; WITH changed AS (UPDATE public.contact_notes SET content='tampered' WHERE author_id='10000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM changed;")" == '0' ]] || fail 'outsider alterou nota de outro autor'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003'; WITH removed AS (DELETE FROM public.contact_notes WHERE author_id='10000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM removed;")" == '0' ]] || fail 'outsider removeu nota de outro autor'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'; WITH removed AS (DELETE FROM public.contact_notes WHERE author_id='10000000-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM removed;")" == '1' ]] || fail 'autor nao conseguiu remover a propria nota'

psql_file "$migration" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='contact_notes'")" == '4' ]] || fail 'segunda aplicacao nao foi idempotente'

printf 'Inbox contact authorization PostgreSQL 17 behavioral contract: PASS\n'
