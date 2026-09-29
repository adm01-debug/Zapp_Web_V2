#!/usr/bin/env bash
# ONDA 2 - auditoria adversarial de SEGURANCA (Postgres) no cluster CONTATOS
# (#1173 F1 / #1198): SECURITY DEFINER, search_path, ACL, guards, trigger de auditoria.
#
# Nao e um gate de CI: e um harness de EVIDENCIA. Cada observacao imprime uma linha
# PROBE|<rotulo>|exit=<n>|<saida> para ser transcrita no relatorio. Nenhum DDL/DML
# toca o banco canonico: tudo roda em container descartavel.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container_name="zapp-w2-contacts-seg-$$"
tmp_dir="$(mktemp -d /tmp/zapp-w2-contacts-seg.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-w2-contacts-seg-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in /tmp/zapp-w2-contacts-seg.*) rm -rf -- "$tmp_dir" ;; esac
}
trap cleanup EXIT INT TERM

docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=w2_fixture_only postgres:17-alpine >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -c 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || { echo 'FAIL: PostgreSQL de teste nao iniciou'; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
psql_nofail() { docker exec "$container_name" psql -X -qAt -U postgres -d postgres -c "$1" 2>&1; }

# probe: rotulo + SQL; nunca aborta, sempre transcreve exit code e saida
probe() {
  local label="$1" sql="$2" out st
  out="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; st=$?
  printf 'PROBE|%s|exit=%s|%s\n' "$label" "$st" "$(printf '%s' "$out" | tr '\n' '~' | cut -c1-500)"
}

echo "### HARNESS ativo: cluster CONTATOS (F1/#1198) - PostgreSQL 17 descartavel"

# ─────────────────────────────────────────────────────────────────────────────
# Fixture: estado ANTERIOR as migrations (espelha contacts-soft-delete-and-status.test.sh)
# ─────────────────────────────────────────────────────────────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, nickname text, surname text, job_title text, company text,
  phone text NOT NULL, email text, avatar_url text, tags text[], notes text, contact_type text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  conversation_status text DEFAULT 'open',
  conversation_status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision, longitude double precision,
  address text, address_number text, neighborhood text, city text, state text, postal_code text
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_select_policy ON public.contacts FOR SELECT TO authenticated USING (true);

ALTER TABLE public.contacts ADD CONSTRAINT contacts_conversation_status_check
  CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived'));
ALTER TABLE public.contacts ADD CONSTRAINT chk_conversation_status_values
  CHECK (conversation_status IS NULL OR conversation_status IN ('open', 'resolved', 'pending', 'closed'));

CREATE FUNCTION public.enforce_conversation_status_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN RETURN NEW; END; $function$;
CREATE TRIGGER trg_contacts_fsm_transition BEFORE UPDATE ON public.contacts FOR EACH ROW
  WHEN (old.conversation_status IS DISTINCT FROM new.conversation_status)
  EXECUTE FUNCTION public.enforce_conversation_status_transition();

CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES public.contacts(id), is_read boolean DEFAULT false);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = '20000000-0000-0000-0000-000000000009'::uuid $$;

CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    OR (queue_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.queue_members qm
         WHERE qm.queue_id = public.contacts.queue_id
           AND qm.profile_id = get_profile_id_for_user(auth.uid())
           AND qm.is_active = true))
  );

CREATE FUNCTION public.prevent_contact_assignee_hijack() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM profiles p JOIN user_roles ur ON ur.user_id = p.user_id
                     WHERE p.id = NEW.assigned_to AND p.is_active = true
                       AND ur.role IN ('agent','supervisor','admin')) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.prevent_contact_queue_hijack() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.queue_id IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
     AND NOT EXISTS (SELECT 1 FROM queue_members qm WHERE qm.queue_id = NEW.queue_id
                       AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true)
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_prevent_contact_assignee_hijack BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_assignee_hijack();
CREATE TRIGGER trg_prevent_contact_queue_hijack BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_queue_hijack();

-- Estado real de 27/09 (20260927310000 + 20260927390000): PUBLIC e anon ja sem EXECUTE
-- nestas tres funcoes de trigger. Sem isto o harness acusaria um residuo de ACL que NAO
-- existe em producao.
REVOKE EXECUTE ON FUNCTION public.enforce_conversation_status_transition() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_contact_assignee_hijack() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_contact_queue_hijack() FROM PUBLIC, anon;

CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN RETURN; END; $function$;
REVOKE EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) TO authenticated, service_role;

CREATE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ SELECT COALESCE(c.contact_type,'cliente'), COUNT(*) FROM public.contacts c GROUP BY 1 $function$;

-- audit_logs: RLS ligada, SELECT so por policy, INSERT/UPDATE/DELETE bloqueados para
-- authenticated (estado real apos 20260404174354 + 20260405225633/20260405230135)
-- e sem privilegio de tabela (20260903240000).
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, action text NOT NULL, entity_type text, entity_id uuid, details jsonb,
  ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block authenticated inserts on audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Block authenticated updates on audit_logs" ON public.audit_logs FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Block authenticated deletes on audit_logs" ON public.audit_logs FOR DELETE TO authenticated USING (false);
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contacts TO authenticated;
GRANT SELECT ON public.contacts TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',true),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',false),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009',true);
INSERT INTO public.user_roles VALUES
  ('20000000-0000-0000-0000-000000000001','agent'),
  ('20000000-0000-0000-0000-000000000002','agent'),
  ('20000000-0000-0000-0000-000000000009','admin');
INSERT INTO public.queues VALUES ('50000000-0000-0000-0000-000000000001'), ('50000000-0000-0000-0000-000000000002');
INSERT INTO public.queue_members VALUES ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true);
-- fila 2 com o perfil ALHEIO ativo: base do oraculo de pertencimento (5 args de can_edit_contact)
INSERT INTO public.queue_members VALUES ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',true);
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, conversation_status, address, city, state) VALUES
  ('30000000-0000-0000-0000-000000000001','Contato do agente','5511900000001','cliente','10000000-0000-0000-0000-000000000001','open','Av. Paulista','Sao Paulo','SP'),
  ('30000000-0000-0000-0000-000000000002','Contato de outro','5511900000002','cliente','10000000-0000-0000-0000-000000000002','open',NULL,NULL,NULL),
  ('30000000-0000-0000-0000-000000000003','Contato sem dono','5511900000003','fornecedor',NULL,'open',NULL,NULL,NULL);
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, queue_id, conversation_status) VALUES
  ('30000000-0000-0000-0000-000000000004','Contato da fila do agente','5511900000004','cliente','10000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','open'),
  ('30000000-0000-0000-0000-000000000005','Contato de fila alheia','5511900000005','cliente','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','open');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null || { echo 'FAIL: fixture pre nao aplicou'; exit 1; }

AGENTE='20000000-0000-0000-0000-000000000001'
ADMIN='20000000-0000-0000-0000-000000000009'
ALHEIO='20000000-0000-0000-0000-000000000002'
P_AGENTE='10000000-0000-0000-0000-000000000001'
P_ALHEIO='10000000-0000-0000-0000-000000000002'

# ─────────────────────────────────────────────────────────────────────────────
# Aplica as 9 migrations do dia no cluster de contatos (na ordem de producao)
# ─────────────────────────────────────────────────────────────────────────────
for m in \
  20260929140000_search_contacts_returns_address \
  20260929150000_contact_address_audit_trigger \
  20260929370000_contacts_soft_delete_and_search_filters \
  20260929380000_disable_sicoob_bridge_trigger \
  20260929560000_contacts_conversation_status_and_grants \
  20260929720000_contacts_delete_align_edit_policy \
  20260929770000_contacts_can_edit_contact_helper \
  20260929780000_contacts_single_permission_predicate \
  20260929790000_contacts_hijack_guards_only_on_change \
  20260929810000_contacts_can_edit_contact_hoisted_params \
  20260929820000_contacts_can_delete_contacts_hoisted_params ; do
  if out="$(psql_file "$repo_root/supabase/migrations/$m.sql" 2>&1)"; then
    echo "APPLY|OK|$m"
  else
    echo "APPLY|FAIL|$m|$(printf '%s' "$out" | tr '\n' '~' | cut -c1-300)"
  fi
done

# `search_contacts` de producao tem 23 colunas e o arquivo 140000 tambem (23); nada a corrigir aqui.

# ═════════════════════════════════════════════════════════════════════════════
echo "### [1] INVENTARIO ACL/prosecdef/search_path das funcoes do dia"
# ═════════════════════════════════════════════════════════════════════════════
probe 'acl_inventory' "
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ||
       ' prosrc_definer=' || p.prosecdef ||
       ' proconfig=' || COALESCE(array_to_string(p.proconfig, ','), '<NULL>') ||
       ' proacl=' || COALESCE(array_to_string(p.proacl, '|'), '<NULL=default PUBLIC EXECUTE>') ||
       ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') ||
       ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'search_contacts','audit_contact_address_change','delete_contact','delete_contacts',
  'contacts_count_by_type','enforce_conversation_status_transition','can_edit_contact',
  'can_delete_contacts','prevent_contact_assignee_hijack','prevent_contact_queue_hijack',
  'get_profile_id_for_user','get_visible_agent_ids','is_admin_or_supervisor','current_profile_id')
ORDER BY p.proname, 1"

echo "### [1b] triggers do dia em public.contacts"
probe 'triggers_contacts' "
SELECT t.tgname || ' -> ' || p.proname || ' definer=' || p.prosecdef
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.contacts'::regclass AND NOT t.tgisinternal ORDER BY 1"

echo "### [1c] policies de public.contacts (final)"
probe 'policies_contacts' "
SELECT policyname || ' cmd=' || cmd || ' roles=' || array_to_string(roles,'/') || ' qual=' || COALESCE(qual,'-')
FROM pg_policies WHERE schemaname='public' AND tablename='contacts' ORDER BY policyname"

echo "### [1d] funcoes SECURITY DEFINER do dia que NAO fixam pg_temp no search_path"
probe 'definer_without_pg_temp' "
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%pg_temp%')
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%\"\$user\"%')
ORDER BY 1"

echo "### [1e] search_contacts final: referencia sem schema?"
probe 'search_contacts_unqualified' "
SELECT (CASE WHEN pg_get_functiondef('public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)'::regprocedure)
        ~ '(is_admin_or_supervisor|get_visible_agent_ids|get_profile_id_for_user|can_edit_contact)\('
        AND pg_get_functiondef('public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)'::regprocedure)
        !~ 'public\.(is_admin_or_supervisor|get_visible_agent_ids|get_profile_id_for_user|can_edit_contact)\('
        THEN 'SIM - chamada sem schema' ELSE 'NAO - tudo qualificado' END)"

# ═════════════════════════════════════════════════════════════════════════════
echo "### [2] BURLA DOS GUARDS: session_replication_role e GUC request.jwt.claims"
# ═════════════════════════════════════════════════════════════════════════════
probe 'srr_authenticated' "SET ROLE authenticated; SET session_replication_role = replica; SELECT 'set-ok'"
probe 'srr_service_role'   "SET ROLE service_role; SET session_replication_role = replica; SELECT 'set-ok'"
probe 'srr_dono_tabela'    "SET session_replication_role = replica; SELECT 'set-ok (postgres=superuser)'"

# baseline: como authenticated COM claims corretos, reatribuir deve falhar
probe 'guard_reenquadro_com_claims' "
SET ROLE authenticated;
SET request.jwt.claim.sub='$AGENTE';
SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$AGENTE\"}';
UPDATE public.contacts SET assigned_to='$P_ALHEIO' WHERE id='30000000-0000-0000-0000-000000000001';"

# BURLA: mesma sessao autenticada, porem sem request.jwt.claims (auth.uid() continua valendo)
probe 'guard_reenquadro_sem_claims_guc' "
SET ROLE authenticated;
SET request.jwt.claim.sub='$AGENTE';
RESET request.jwt.claims;
UPDATE public.contacts SET assigned_to='$P_ALHEIO' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING 'REATRIBUIDO';"
probe 'estado_apos_burla' "SELECT assigned_to FROM public.contacts WHERE id='30000000-0000-0000-0000-000000000001'"

# volta o estado
psql_sql "UPDATE public.contacts SET assigned_to='$P_AGENTE' WHERE id='30000000-0000-0000-0000-000000000001'" >/dev/null
probe 'guard_reenquadro_sem_role_no_claims' "
SET ROLE authenticated;
SET request.jwt.claim.sub='$AGENTE';
SET request.jwt.claims='{\"sub\":\"$AGENTE\"}';
UPDATE public.contacts SET assigned_to='$P_ALHEIO' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING 'REATRIBUIDO-sem-guard';"
psql_sql "UPDATE public.contacts SET assigned_to='$P_AGENTE' WHERE id='30000000-0000-0000-0000-000000000001'" >/dev/null

echo "### [5b] semantica do pg_temp: onde ele e resolvido em cada search_path"
probe 'prep_pg_temp_shadow' "CREATE FUNCTION public.w2_probe_pub() RETURNS regclass LANGUAGE sql SECURITY DEFINER SET search_path='public' AS 'SELECT ''profiles''::regclass';
CREATE FUNCTION public.w2_probe_pub_temp() RETURNS regclass LANGUAGE sql SECURITY DEFINER SET search_path='public','pg_temp' AS 'SELECT ''profiles''::regclass';
SELECT 'preparado'"
probe 'pg_temp_primeiro_quando_ausente' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
CREATE TEMP TABLE profiles (id uuid);
SELECT public.w2_probe_pub()::oid = (SELECT oid FROM pg_class WHERE relname='profiles' AND relnamespace=pg_my_temp_schema()) AS resolve_para_temp" 

probe 'pg_temp_por_ultimo_quando_declarado' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
CREATE TEMP TABLE profiles (id uuid);
SELECT public.w2_probe_pub_temp()::oid = (SELECT oid FROM pg_class WHERE relname='profiles' AND relnamespace='public'::regnamespace) AS resolve_para_public"

probe 'guard_reenquadro_role_forjado' "
SET ROLE authenticated;
SET request.jwt.claim.sub='$AGENTE';
SET request.jwt.claims='{\"role\":\"service_role\",\"sub\":\"$AGENTE\"}';
UPDATE public.contacts SET assigned_to='$P_ALHEIO' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING 'REATRIBUIDO';"
psql_sql "UPDATE public.contacts SET assigned_to='$P_AGENTE' WHERE id='30000000-0000-0000-0000-000000000001'" >/dev/null

probe 'guard_mover_fila_sem_claims' "
SET ROLE authenticated;
SET request.jwt.claim.sub='$AGENTE';
RESET request.jwt.claims;
UPDATE public.contacts SET queue_id='50000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING 'MOVIDO';"
psql_sql "UPDATE public.contacts SET queue_id=NULL WHERE id='30000000-0000-0000-0000-000000000001'" >/dev/null

# ═════════════════════════════════════════════════════════════════════════════
echo "### [3] ACL: PUBLIC/anon executando funcoes internas do dia"
# ═════════════════════════════════════════════════════════════════════════════
probe 'public_execute_funcs_dia' "
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') definer=' || p.prosecdef ||
       ' triggerfn=' || (p.prorettype = 'trigger'::regtype)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl::text[]) a WHERE a LIKE '=%X/%'))
  AND p.proname IN ('search_contacts','audit_contact_address_change','delete_contact','delete_contacts',
    'contacts_count_by_type','enforce_conversation_status_transition','can_edit_contact','can_delete_contacts',
    'prevent_contact_assignee_hijack','prevent_contact_queue_hijack')
ORDER BY 1"
probe 'definer_sem_pg_temp_e_ref_sem_schema' "
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) c WHERE c LIKE '%pg_temp%')
  AND pg_get_functiondef(p.oid) ~ '(^|[^a-zA-Z0-9_.])(contacts|profiles|user_roles|queue_members|audit_logs|team_messages|team_conversations|team_conversation_members|team_message_reactions|team_message_receipts)([^a-zA-Z0-9_]|\$)'
ORDER BY 1"
probe 'anon_chama_can_edit_contact' "SET ROLE anon; SELECT public.can_edit_contact('$P_AGENTE'::uuid, NULL)"
probe 'anon_chama_can_delete_contacts' "SET ROLE anon; SELECT * FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])"
probe 'anon_chama_search_contacts' "SET ROLE anon; SELECT count(*) FROM public.search_contacts()"
probe 'anon_chama_audit_fn_direto' "SET ROLE anon; SELECT public.audit_contact_address_change()"
probe 'auth_chama_audit_fn_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.audit_contact_address_change()"
probe 'anon_chama_guard_direto' "SET ROLE anon; SELECT public.prevent_contact_assignee_hijack()"
probe 'anon_chama_fsm_direto' "SET ROLE anon; SELECT public.enforce_conversation_status_transition()"
probe 'anon_chama_contacts_count_by_type' "SET ROLE anon; SELECT * FROM public.contacts_count_by_type()"

# ═════════════════════════════════════════════════════════════════════════════
echo "### [4] can_edit_contact: parametros do cliente e oraculo"
# ═════════════════════════════════════════════════════════════════════════════
probe 'cec_outro_tenant_2args' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
SELECT public.can_edit_contact('$P_ALHEIO'::uuid, NULL)"
probe 'cec_p_is_admin_forjado' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
SELECT public.can_edit_contact('$P_ALHEIO'::uuid, '50000000-0000-0000-0000-000000000002'::uuid, ARRAY[]::uuid[], NULL, true)"
probe 'cec_p_visible_forjado' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
SELECT public.can_edit_contact('$P_ALHEIO'::uuid, NULL, ARRAY['$P_ALHEIO'::uuid], NULL, false)"
probe 'cec_oraculo_existe_perfil_qualquer' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
SELECT public.can_edit_contact('10000000-0000-0000-0000-0000000000ff'::uuid, NULL, ARRAY['10000000-0000-0000-0000-0000000000ff'::uuid], NULL, false)"
probe 'cec_oraculo_membro_da_fila_alheia' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
SELECT 'outro_perfil_na_fila_2=' || public.can_edit_contact(NULL, '50000000-0000-0000-0000-000000000002'::uuid, ARRAY[]::uuid[], '$P_ALHEIO'::uuid, false) ||
       ' eu_na_fila_2=' || public.can_edit_contact(NULL, '50000000-0000-0000-0000-000000000002'::uuid, ARRAY[]::uuid[], '$P_AGENTE'::uuid, false)"

echo "### [4b] can_delete_contacts: oraculo de existencia de contato alheio"
probe 'cdc_contato_alheio_invisivel' "
SET ROLE authenticated; SET request.jwt.claim.sub='$ALHEIO';
SELECT 'linhas=' || count(*) || ' ids=' || COALESCE(string_agg(contact_id::text,','),'-') || ' can_delete=' || COALESCE(string_agg(can_delete::text,','),'-')
FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])"
psql_sql "UPDATE public.contacts SET deleted_at = now() WHERE id='30000000-0000-0000-0000-000000000003'" >/dev/null
probe 'cdc_contato_soft_deletado_alheio' "
SET ROLE authenticated; SET request.jwt.claim.sub='$ALHEIO';
SELECT 'linhas=' || count(*) FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])"
probe 'cdc_uuid_inexistente' "
SET ROLE authenticated; SET request.jwt.claim.sub='$ALHEIO';
SELECT count(*) FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-0000000000ff']::uuid[])"
probe 'cdc_alheio_le_contatos_direto' "
SET ROLE authenticated; SET request.jwt.claim.sub='$ALHEIO';
SELECT count(*) FROM public.contacts"

# ═════════════════════════════════════════════════════════════════════════════
echo "### [5] pg_temp shadowing e privilegio de CREATE"
# ═════════════════════════════════════════════════════════════════════════════
probe 'db_temp_privilege' "SELECT has_database_privilege('authenticated', current_database(), 'TEMP')"
probe 'auth_create_temp_table' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
CREATE TEMP TABLE shadow_x(a int); SELECT 'temp-criada'"
probe 'auth_schema_create_public' "SELECT has_schema_privilege('authenticated','public','CREATE')"
probe 'auth_create_func_public' "SET ROLE authenticated; CREATE FUNCTION public.w2_evil() RETURNS int LANGUAGE sql AS 'SELECT 1'; SELECT 'criada'"

# ═════════════════════════════════════════════════════════════════════════════
echo "### [6] Trigger de auditoria de endereco: SECURITY DEFINER + RLS de audit_logs"
# ═════════════════════════════════════════════════════════════════════════════
probe 'audit_logs_rls_insert_direto' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
INSERT INTO public.audit_logs (user_id, action) VALUES ('$AGENTE'::uuid,'tentativa_direta') RETURNING 'INSERIU'"
probe 'audit_logs_insert_sem_privilegio?' "
SELECT has_table_privilege('authenticated','public.audit_logs','INSERT')"
probe 'trigger_auditoria_grava_via_definer' "
SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE';
UPDATE public.contacts SET address='Rua Nova' WHERE id='30000000-0000-0000-0000-000000000001'; SELECT 'update-ok'"
probe 'audit_logs_linhas_apos_trigger' "SELECT count(*) || ' | ' || COALESCE(string_agg(action||'/user_id='||COALESCE(user_id::text,'NULL'), ' ; '),'-') FROM public.audit_logs"
probe 'anon_dispara_trigger_auditoria' "
SET ROLE anon;
INSERT INTO public.audit_logs (user_id, action) VALUES (NULL,'anon_direto') RETURNING 'INSERIU'"

printf 'HARNESS-END|cluster=contatos\n'
