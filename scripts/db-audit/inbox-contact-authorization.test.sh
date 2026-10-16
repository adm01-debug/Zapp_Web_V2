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

# ============================================================================================
# message_reactions — SEC-RLS_CONTATOS_MENSAGENS-04: as policies de INSERT/UPDATE/DELETE
# checavam só a visibilidade do contato/mensagem, nunca se user_id é o do próprio chamador.
# Bloco A fiel ao estado ANTERIOR (policies vigentes). Bloco B com a migration aplicada.
# MR_USER_ID_FIX=0 roda o bloco B SEM aplicar a migration — é assim que se prova o vermelho.
# ============================================================================================
fix_migration="$repo_root/supabase/migrations/20261011003021_message_reactions_user_id_amarrado.sql"
[[ -f "$fix_migration" ]] || fail "migration da amarra de user_id nao encontrada: $fix_migration"

printf '\n============ message_reactions: user_id amarrado ao chamador ============\n'

# Tabela + RLS + GRANT + PRE-ESTADO (policies como estão hoje, sem a amarra de user_id).
psql_sql "
  CREATE TABLE public.message_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reaction_author_check CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL),
    UNIQUE (message_id, user_id, emoji),
    UNIQUE (message_id, contact_id, emoji)
  );
  ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
  CREATE POLICY \"message_reactions_select_policy\" ON public.message_reactions FOR SELECT TO authenticated
    USING (is_admin_or_supervisor(auth.uid()) OR user_id = auth.uid()
      OR contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))));
  CREATE POLICY \"message_reactions_insert_policy\" ON public.message_reactions FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
  CREATE POLICY \"Users can insert reactions for assigned contacts\" ON public.message_reactions FOR INSERT TO authenticated
    WITH CHECK (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR is_admin_or_supervisor(auth.uid()));
  CREATE POLICY \"message_reactions_update_policy\" ON public.message_reactions FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
  CREATE POLICY \"message_reactions_delete_policy\" ON public.message_reactions FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid()) OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
  CREATE POLICY \"Users can delete their own reactions\" ON public.message_reactions FOR DELETE TO authenticated
    USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
" >/dev/null

# BETO (1000...0002) é dono do contato/mensagem; ATILA (1000...0001) entra só como terceiro a ser personificado.
psql_sql "
  INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',NULL);
  INSERT INTO public.messages (id, contact_id, media_url) VALUES ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003',NULL);
" >/dev/null

JWT_A='20000000-0000-0000-0000-000000000001'
JWT_B='20000000-0000-0000-0000-000000000002'
JWT_ADMIN='20000000-0000-0000-0000-000000000005'
P_A='10000000-0000-0000-0000-000000000001'
P_B='10000000-0000-0000-0000-000000000002'
P_ADMIN='10000000-0000-0000-0000-000000000005'
MSG_B='40000000-0000-0000-0000-000000000003'
MSG_A='40000000-0000-0000-0000-000000000001'
CONTACT_B='30000000-0000-0000-0000-000000000003'

printf '\n---- bloco A: estado ANTERIOR (defeito) ----\n'
psql_sql "INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_A','$CONTACT_B',':+1:');" >/dev/null

psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_A','$CONTACT_B',':heart:');" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM public.message_reactions WHERE message_id='$MSG_B' AND user_id='$P_A' AND emoji=':heart:'")" == '1' ]] \
  || fail 'A.1 (DEFEITO) personificacao de user_id deveria passar no estado anterior'

[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; WITH removed AS (DELETE FROM public.message_reactions WHERE message_id='$MSG_B' AND user_id='$P_A' AND emoji=':+1:' RETURNING 1) SELECT count(*) FROM removed;")" == '1' ]] \
  || fail 'A.2 (DEFEITO) BETO deveria apagar reacao de terceiro no estado anterior'
printf '[PASS] A.1/A.2 (DEFEITO) personificacao e remocao de reacao alheia passavam\n'

if [[ "${MR_USER_ID_FIX:-1}" = "0" ]]; then
  printf '>>> MR_USER_ID_FIX=0: bloco B roda SEM aplicar a nova migration (prova do vermelho)\n'
else
  psql_file "$fix_migration" >/dev/null
fi

printf '\n---- bloco B: migration aplicada ----\n'
psql_sql "DELETE FROM public.message_reactions; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_A','$CONTACT_B',':+1:');" >/dev/null

expect_failure 'B.0 (CORRIGIDO) reacao com user_id de terceiro e RECUSADA' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_A','$CONTACT_B',':heart:');"

[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; WITH removed AS (DELETE FROM public.message_reactions WHERE message_id='$MSG_B' AND user_id='$P_A' AND emoji=':+1:' RETURNING 1) SELECT count(*) FROM removed;")" == '0' ]] \
  || fail 'B.1 (CORRIGIDO) BETO apagou reacao de terceiro'
[[ "$(psql_sql "SELECT count(*) FROM public.message_reactions WHERE message_id='$MSG_B' AND user_id='$P_A' AND emoji=':+1:'")" == '1' ]] \
  || fail 'B.2 a reacao de ATILA deveria permanecer intacta'
printf '[PASS] B.1/B.2 reacao de terceiro nao pode ser removida nem alterada\n'

[[ -n "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_B','$CONTACT_B',':ok:') ON CONFLICT (message_id,user_id,emoji) DO UPDATE SET contact_id=EXCLUDED.contact_id, emoji=EXCLUDED.emoji RETURNING id;")" ]] \
  || fail 'B.3 caminho legitimo: upsert do hook (reagir) falhou'
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_B','$CONTACT_B',':ok:') ON CONFLICT (message_id,user_id,emoji) DO UPDATE SET contact_id=EXCLUDED.contact_id;" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM public.message_reactions WHERE message_id='$MSG_B' AND user_id='$P_B'")" == '1' ]] \
  || fail 'B.4 o upsert duplicou a reacao propria'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; WITH removed AS (DELETE FROM public.message_reactions WHERE message_id='$MSG_B' AND user_id='$P_B' AND emoji=':ok:' RETURNING 1) SELECT count(*) FROM removed;")" == '1' ]] \
  || fail 'B.5 BETO nao conseguiu remover a propria reacao'
printf '[PASS] B.3/B.4/B.5 reagir e remover a propria reacao seguem funcionando (upsert do hook)\n'

expect_failure 'B.6 visibilidade preservada: BETO nao reage em mensagem de contato alheio' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_B'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_A','$P_B',NULL,':x:');"
expect_failure 'B.7 admin tambem nao personifica terceiro (sem excecao)' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_ADMIN'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_A',NULL,':rocket:');"
[[ -n "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$JWT_ADMIN'; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_ADMIN',NULL,':tada:') RETURNING id;")" ]] \
  || fail 'B.8 admin nao consegue reagir com o proprio user_id'
expect_failure 'B.9 anon nao insere reacao' \
  "SET ROLE anon; INSERT INTO public.message_reactions (message_id,user_id,contact_id,emoji) VALUES ('$MSG_B','$P_ADMIN',NULL,':x:');"

psql_file "$fix_migration" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND cmd IN ('INSERT','UPDATE','DELETE')")" == '3' ]] \
  || fail 'B.10 segunda aplicacao nao foi idempotente'
[[ "$(psql_sql "SELECT relrowsecurity FROM pg_class WHERE oid='public.message_reactions'::regclass")" == 't' ]] \
  || fail 'B.11 RLS de message_reactions caiu'
printf '[PASS] B.6-B.11 visibilidade intacta, sem excecao de admin, anon bloqueado e migration idempotente\n'

printf 'Inbox contact authorization PostgreSQL 17 behavioral contract: PASS\n'
