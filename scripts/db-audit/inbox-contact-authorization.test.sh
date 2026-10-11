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
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid, action text NOT NULL, entity_type text, entity_id uuid,
    details jsonb DEFAULT '{}'
  );
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
  INSERT INTO auth.users (id) VALUES
    ('20000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000006');
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

# =====================================================================================
# Favoritar / fixar / reportar mensagem (message_favorites, message_pins, message_reports)
# =====================================================================================
favorites_migration="$repo_root/supabase/migrations/20261011125915_message_favorites_pins_reports.sql"
[[ -f "$favorites_migration" ]] || fail 'migration de favoritos/fixar/reportar nao encontrada'
fix_migration="$repo_root/supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql"
[[ -f "$fix_migration" ]] || fail 'migration corretiva de reason/search_path nao encontrada'

# mais mensagens na MESMA conversa (contato A) para exercitar o teto de 3 fixos
psql_sql "INSERT INTO public.messages (id, contact_id, media_url) VALUES
  ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',NULL),
  ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001',NULL),
  ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001',NULL);" >/dev/null

psql_file "$favorites_migration" >/dev/null
psql_file "$fix_migration" >/dev/null

U1='20000000-0000-0000-0000-000000000001'   # dono do contato A
U2='20000000-0000-0000-0000-000000000002'   # membro ativo da fila do contato A
U3='20000000-0000-0000-0000-000000000003'   # estranho (sem acesso a A)
U5='20000000-0000-0000-0000-000000000005'   # admin/supervisor
CA='30000000-0000-0000-0000-000000000001'   # contato visivel
CB='30000000-0000-0000-0000-000000000002'   # contato oculto
M1='40000000-0000-0000-0000-000000000001'
M2='40000000-0000-0000-0000-000000000002'
M3='40000000-0000-0000-0000-000000000003'
M4='40000000-0000-0000-0000-000000000004'
M5='40000000-0000-0000-0000-000000000005'

[[ "$(psql_sql "SELECT count(*) FROM pg_class WHERE relname IN ('message_favorites','message_pins','message_reports') AND relrowsecurity")" == '3' ]] || fail 'RLS nao esta habilitada nas 3 tabelas novas'
[[ "$(psql_sql "SELECT count(*) FROM information_schema.table_privileges WHERE grantee='anon' AND table_name IN ('message_favorites','message_pins','message_reports')")" == '0' ]] || fail 'anon conservou privilegio de tabela'
[[ "$(psql_sql "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_name IN ('toggle_message_favorite','pin_message','unpin_message','report_message') AND grantee IN ('PUBLIC','anon')")" == '0' ]] || fail 'PUBLIC ou anon conservou EXECUTE nas RPCs novas'
[[ "$(psql_sql "SELECT has_function_privilege('authenticated','public.pin_message(uuid)','EXECUTE')")" == 't' ]] || fail 'authenticated sem EXECUTE em pin_message'
[[ "$(psql_sql "SELECT has_function_privilege('service_role','public.report_message(uuid,text,text)','EXECUTE')")" == 't' ]] || fail 'service_role sem EXECUTE em report_message'
# P1 (refazer 2): endurecimento das 4 RPCs — search_path travado e EXECUTE só para authenticated/service_role
[[ "$(psql_sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('toggle_message_favorite','pin_message','unpin_message','report_message') AND p.proconfig::text LIKE '%search_path=pg_catalog, public%';")" == '4' ]] || fail 'RPC nova sem SET search_path = pg_catalog, public'
[[ "$(psql_sql "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_name IN ('toggle_message_favorite','pin_message','unpin_message','report_message') AND grantee='authenticated';")" == '4' ]] || fail 'authenticated sem EXECUTE em alguma RPC nova'
expect_failure 'anon sem EXECUTE nas RPCs novas' "SET ROLE anon; SELECT public.toggle_message_favorite('$M1');"

# ---- favoritar (toggle) ----
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.toggle_message_favorite('$M1');")" == 't' ]] || fail 'toggle deveria favoritar'
[[ "$(psql_sql "SELECT count(*) FROM public.message_favorites WHERE message_id='$M1'")" == '1' ]] || fail 'favorito nao foi gravado'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.toggle_message_favorite('$M1');")" == 'f' ]] || fail 'segundo toggle deveria desfavoritar'
[[ "$(psql_sql "SELECT count(*) FROM public.message_favorites WHERE message_id='$M1'")" == '0' ]] || fail 'desfavoritar nao removeu a linha'
expect_failure 'favoritar mensagem de contato oculto (42501)' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.toggle_message_favorite('$M1');"
expect_failure 'favoritar em nome de outro usuario (spoof de user_id)' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; INSERT INTO public.message_favorites (user_id, message_id) VALUES ('$U2','$M1');"
expect_failure 'RPC sem sessao autenticada' "SET ROLE authenticated; SELECT public.toggle_message_favorite('$M1');"

psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; INSERT INTO public.message_favorites (user_id, message_id) VALUES ('$U2','$M1');" >/dev/null
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT count(*) FROM public.message_favorites;")" == '1' ]] || fail 'autor nao viu o proprio favorito'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U1'; SELECT count(*) FROM public.message_favorites;")" == '0' ]] || fail 'usuario viu favorito de outro'

# ---- fixar (teto de 3 por conversa) ----
PIN1="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.pin_message('$M1');")"
[[ "$PIN1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fail "pin_message nao devolveu uuid (=$PIN1)"
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.pin_message('$M1');")" == "$PIN1" ]] || fail 'pin_message nao foi idempotente para a mesma mensagem'
[[ "$(psql_sql "SELECT count(*) FROM public.message_pins WHERE contact_id='$CA'")" == '1' ]] || fail 'fixar duplicou a linha'
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.pin_message('$M3'); SELECT public.pin_message('$M4');" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM public.message_pins WHERE contact_id='$CA'")" == '3' ]] || fail 'nao chegou aos 3 fixos'
expect_failure 'quarto fixo na conversa (pin_limit_reached)' "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.pin_message('$M5');"
expect_failure 'fixar mensagem de contato oculto' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.pin_message('$M2');"
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT count(*) FROM public.message_pins;")" == '3' ]] || fail 'membro da fila nao viu os 3 fixos'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U1'; SELECT count(*) FROM public.message_pins;")" == '3' ]] || fail 'dono do contato nao viu os fixos'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U5'; SELECT count(*) FROM public.message_pins;")" == '3' ]] || fail 'admin nao viu os fixos'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT count(*) FROM public.message_pins;")" == '0' ]] || fail 'estranho viu fixos'
expect_failure 'escrita direta em message_pins sem RPC' "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; INSERT INTO public.message_pins (contact_id, message_id, pinned_by) VALUES ('$CA','$M5','$U2');"

# gatilho deriva contact_id da mensagem (nao aceita contato forjado)
psql_sql "INSERT INTO public.message_pins (contact_id, message_id, pinned_by) VALUES ('$CB','$M5','$U2');" >/dev/null
[[ "$(psql_sql "SELECT contact_id FROM public.message_pins WHERE message_id='$M5'")" == "$CA" ]] || fail 'gatilho nao derivou contact_id da mensagem'
psql_sql "DELETE FROM public.message_pins WHERE message_id='$M5';" >/dev/null

# ---- desafixar ----
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.unpin_message('$M1');")" == 't' ]] || fail 'unpin deveria remover o fixo'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.unpin_message('$M1');")" == 'f' ]] || fail 'unpin de fixo inexistente deveria devolver false'
[[ "$(psql_sql "SELECT count(*) FROM public.message_pins WHERE contact_id='$CA'")" == '2' ]] || fail 'unpin nao removeu o fixo'
expect_failure 'desafixar mensagem de contato oculto' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.unpin_message('$M2');"

# ---- reportar ----
R1="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.report_message('$M1','spam','mensagem suspeita');")"
[[ "$R1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fail "report_message nao devolveu uuid (=$R1)"
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.report_message('$M1','spam','de novo');")" == "$R1" ]] || fail 'relato duplicado nao devolveu o id existente'
# Juiz item 1: reason com os valores do cartao ('spam','improprio','urgencia','outro')
[[ "$(psql_sql "SELECT count(*) FROM information_schema.table_constraints WHERE constraint_schema='public' AND table_name='message_reports' AND constraint_name IN ('message_reports_reason_check','message_reports_note_check','message_reports_status_check');")" == '3' ]] || fail 'CHECKs de message_reports duplicados ou ausentes (reason, note, status)'
[[ "$(psql_sql "SELECT count(*) FROM information_schema.check_constraints WHERE constraint_schema='public' AND constraint_name='message_reports_reason_check' AND check_clause LIKE '%improprio%';")" == '1' ]] || fail 'CHECK de reason sem os valores do cartao'
[[ "$(psql_sql "SELECT count(*) FROM public.message_reports WHERE message_id='$M1'")" == '1' ]] || fail 'relato duplicou a linha do mesmo usuario'
expect_failure 'relato com motivo invalido (22023)' "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.report_message('$M1','xingamento',NULL);"
expect_failure 'relato com nota acima de 500 caracteres' "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT public.report_message('$M1','outro',repeat('a',501));"
expect_failure 'relatar mensagem de contato oculto' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.report_message('$M2','spam',NULL);"
expect_failure 'escrita direta de relato sem RPC' "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; INSERT INTO public.message_reports (message_id, reporter_id, reason) VALUES ('$M1','$U2','spam');"
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U2'; SELECT count(*) FROM public.message_reports;")" == '1' ]] || fail 'autor nao viu o proprio relato'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U1'; SELECT count(*) FROM public.message_reports;")" == '0' ]] || fail 'terceiro viu relato alheio'
# Juiz item 3: U5 e supervisor sem ser admin — sem linha 'admin' em user_roles e dentro do conjunto supervisor
[[ "$(psql_sql "SELECT count(*) FROM public.user_roles WHERE user_id='$U5' AND role='admin';")" == '0' ]] || fail 'U5 tem papel admin (deveria ser so supervisor)'
[[ "$(psql_sql "SELECT public.is_admin_or_supervisor('$U5'::uuid);")" == 't' ]] || fail 'U5 deveria ser supervisor'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U5'; SELECT count(*) FROM public.message_reports;")" == '1' ]] || fail 'admin nao viu o relato'
# Juiz item 1 (inserção real): reason 'improprio' do cartão entra de ponta a ponta (após as contagens acima)
R_IMP="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U1'; SELECT public.report_message('$M3','improprio',NULL);")"
[[ "$R_IMP" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fail "reason 'improprio' do cartao foi rejeitado (=$R_IMP)"

# ---- status do relato: so admin, com carimbo do proprio revisor ----
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U1'; WITH changed AS (UPDATE public.message_reports SET status='dismissed' WHERE id='$R1' RETURNING 1) SELECT count(*) FROM changed;")" == '0' ]] || fail 'nao-admin alterou o status do relato'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U5'; WITH changed AS (UPDATE public.message_reports SET status='resolved', resolved_by='$U5', resolved_at=now() WHERE id='$R1' RETURNING 1) SELECT count(*) FROM changed;")" == '1' ]] || fail 'admin nao conseguiu resolver o relato'
expect_failure 'resolver carimbando outro revisor' "SET ROLE authenticated; SET request.jwt.claim.sub='$U5'; UPDATE public.message_reports SET status='dismissed', resolved_by='$U1' WHERE id='$R1';"
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U1'; SELECT public.report_message('$M1','urgencia',NULL);" >/dev/null
expect_failure 'resolver sem carimbar resolved_by' "SET ROLE authenticated; SET request.jwt.claim.sub='$U5'; UPDATE public.message_reports SET status='resolved' WHERE reporter_id='$U1';"

# ---- auditoria sem conteudo de mensagem ----
[[ "$(psql_sql "SELECT count(*) FROM public.audit_logs WHERE action IN ('message_pinned','message_unpinned','message_reported')")" -ge '3' ]] || fail 'auditoria nao registrou fixar/desafixar/reportar'
[[ "$(psql_sql "SELECT count(*) FROM public.audit_logs WHERE entity_type='message' AND entity_id IS NULL")" == '0' ]] || fail 'evento de auditoria sem id de mensagem'
[[ "$(psql_sql "SELECT count(*) FROM public.audit_logs WHERE details::text LIKE '%object/path%' OR details::text LIKE '%mensagem suspeita%'")" == '0' ]] || fail 'auditoria guardou conteudo da mensagem ou da nota'
[[ "$(psql_sql "SELECT count(*) FROM public.audit_logs WHERE action='message_reported' AND details->>'reason' IS NULL")" == '0' ]] || fail 'evento de relato sem motivo'

# P2 (refazer 2): sem oraculo — existe-mas-oculto responde igual a inexistente
expect_same_failure() {
  local label="$1" sql_exist="$2" sql_ghost="$3" out_exist out_ghost status
  set +e
  out_exist="$(psql_sql "$sql_exist" 2>&1)"; status=$?
  (( status != 0 )) || { set -e; fail "$label (existente) deveria falhar"; }
  out_ghost="$(psql_sql "$sql_ghost" 2>&1)"; status=$?
  (( status != 0 )) || { set -e; fail "$label (inexistente) deveria falhar"; }
  set -e
  [[ "$out_exist" == "$out_ghost" ]] || { printf 'existente=[%s] inexistente=[%s]\n' "$out_exist" "$out_ghost" >&2; fail "$label distingue existente-oculto de inexistente"; }
  [[ "$out_exist" == *'message_not_visible'* ]] || fail "$label nao devolveu message_not_visible"
  printf '[PASS] %s\n' "$label"
}

GHOST='99999999-9999-9999-9999-999999999999'
expect_same_failure 'oraculo do toggle' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.toggle_message_favorite('$M1');" "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.toggle_message_favorite('$GHOST');"
expect_same_failure 'oraculo do pin' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.pin_message('$M1');" "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.pin_message('$GHOST');"
expect_same_failure 'oraculo do unpin' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.unpin_message('$M1');" "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.unpin_message('$GHOST');"
expect_same_failure 'oraculo do report' "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.report_message('$M1','spam',NULL);" "SET ROLE authenticated; SET request.jwt.claim.sub='$U3'; SELECT public.report_message('$GHOST','spam',NULL);"

# ---- reaplicar a migration continua idempotente ----
psql_file "$favorites_migration" >/dev/null
psql_file "$fix_migration" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_class WHERE relname IN ('message_favorites','message_pins','message_reports')")" == '3' ]] || fail 'segunda aplicacao da migration quebrou as tabelas'

# Rollback do cabecalho da migration roda e desfaz tudo (3 tabelas + 4 RPCs + funcao do gatilho)
psql_sql "drop trigger if exists message_pins_force_contact_id on public.message_pins; drop function if exists public.unpin_message(uuid); drop function if exists public.pin_message(uuid); drop function if exists public.report_message(uuid, text, text); drop function if exists public.toggle_message_favorite(uuid); drop function if exists public.message_pins_force_contact_id(); drop table if exists public.message_reports; drop table if exists public.message_pins; drop table if exists public.message_favorites;" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_class WHERE relname IN ('message_favorites','message_pins','message_reports');")" == '0' ]] || fail 'rollback nao removeu as 3 tabelas'
[[ "$(psql_sql "SELECT count(*) FROM pg_proc WHERE proname IN ('toggle_message_favorite','pin_message','unpin_message','report_message','message_pins_force_contact_id');")" == '0' ]] || fail 'rollback nao removeu as funcoes'
psql_file "$favorites_migration" >/dev/null
psql_file "$fix_migration" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_class WHERE relname IN ('message_favorites','message_pins','message_reports');")" == '3' ]] || fail 'reaplicacao pos-rollback quebrou as tabelas'

printf 'Inbox contact authorization PostgreSQL 17 behavioral contract: PASS\n'
