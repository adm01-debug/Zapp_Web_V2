#!/usr/bin/env bash
# Contrato de comportamento do modulo Contatos (plano de 100 etapas, F1):
#   7/8/10 - delete_contact/delete_contacts (soft-delete) e filtro de excluidos nas leituras
#   11     - desligamento da Sicoob Bridge (trigger + funcao)
#   14     - contacts.conversation_status canonico (um CHECK + FSM alinhado)
#   15     - grants de public.contacts (sem TRUNCATE/REFERENCES; anon sem SELECT)
#
# Roda em PostgreSQL 17 descartavel, com o estado ANTERIOR as migrations reproduzido fiel
# (os dois CHECKs conflitantes de status, o FSM antigo de 4 estados, o trigger da Sicoob e
# os grants default do Supabase). A prova do P0 da auditoria de 29/09 e o passo "RED":
# antes da migration 14/15, gravar conversation_status='pending' tem de FALHAR; depois, tem
# de passar. Nenhuma credencial de producao entra aqui.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_soft_delete="$repo_root/supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql"
migration_sicoob="$repo_root/supabase/migrations/20260929380000_disable_sicoob_bridge_trigger.sql"
migration_status="$repo_root/supabase/migrations/20260929560000_contacts_conversation_status_and_grants.sql"
migration_delete_align="$repo_root/supabase/migrations/20260929720000_contacts_delete_align_edit_policy.sql"
migration_helper="$repo_root/supabase/migrations/20260929770000_contacts_can_edit_contact_helper.sql"
migration_single_predicate="$repo_root/supabase/migrations/20260929780000_contacts_single_permission_predicate.sql"
migration_guards="$repo_root/supabase/migrations/20260929790000_contacts_hijack_guards_only_on_change.sql"
migration_hoisted="$repo_root/supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql"
postgres_image="${CONTACTS_F1_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-contacts-f1-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-contacts-f1-test.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-contacts-f1-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    /tmp/zapp-v2-contacts-f1-test.*) rm -rf -- "$tmp_dir" ;;
  esac
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

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
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

# ── Estado ANTERIOR as migrations (fiel ao banco de 29/09) ────────────────────────────────
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
  name text,
  nickname text,
  surname text,
  job_title text,
  company text,
  phone text NOT NULL,
  email text,
  avatar_url text,
  tags text[],
  notes text,
  contact_type text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  conversation_status text DEFAULT 'open',
  conversation_status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  address text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  postal_code text
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_select_policy ON public.contacts FOR SELECT TO authenticated USING (true);

-- Os DOIS CHECKs conflitantes que a auditoria de 29/09 encontrou ativos ao mesmo tempo.
ALTER TABLE public.contacts ADD CONSTRAINT contacts_conversation_status_check
  CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived'));
ALTER TABLE public.contacts ADD CONSTRAINT chk_conversation_status_values
  CHECK (conversation_status IS NULL OR conversation_status IN ('open', 'resolved', 'pending', 'closed'));

-- FSM anterior (4 estados) + trigger, exatamente como estavam em producao.
CREATE FUNCTION public.enforce_conversation_status_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.conversation_status = NEW.conversation_status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting', 'resolved', 'archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open', 'resolved')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open', 'archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status = 'open')
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %',
      OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_contacts_fsm_transition BEFORE UPDATE ON public.contacts FOR EACH ROW
  WHEN (old.conversation_status IS DISTINCT FROM new.conversation_status)
  EXECUTE FUNCTION public.enforce_conversation_status_transition();

-- Sicoob Bridge: trigger em messages + funcao que a alimentava.
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  is_read boolean DEFAULT false
);
CREATE FUNCTION public.notify_sicoob_on_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN RETURN NEW; END; $function$;
CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.notify_sicoob_on_reply();

-- Helpers de visibilidade (mesmo contrato dos reais).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = '20000000-0000-0000-0000-000000000009'::uuid $$;

-- Policy de UPDATE vigente (pre-20260929780000): precisa existir para o RLS deixar algum
-- UPDATE passar -- sem ela o teste mediria "RLS negou", nao o guard de atribuicao.
CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    OR (queue_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.queue_members qm
         WHERE qm.queue_id = public.contacts.queue_id
           AND qm.profile_id = get_profile_id_for_user(auth.uid())
           AND qm.is_active = true
       ))
  );

-- Guards de atribuicao/fila no estado ANTERIOR ao 20260929790000, fieis aos que
-- estao em producao: decidem apenas por NEW, sem comparar com OLD. E esse detalhe
-- que faz um UPDATE que nao toca em assigned_to/queue_id (soft-delete, nota,
-- telefone) ser recusado com mensagem de atribuicao.
CREATE FUNCTION public.prevent_contact_assignee_hijack() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM profiles p JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to AND p.is_active = true
          AND ur.role IN ('agent','supervisor','admin')
      ) THEN
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
     AND NOT EXISTS (
       SELECT 1 FROM queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = get_profile_id_for_user(auth.uid())
         AND qm.is_active = true
     )
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

-- search_contacts/contacts_count_by_type no estado anterior (sem deleted_at).
CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
         c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
         c.created_at, c.updated_at, c.latitude, c.longitude,
         COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE (v_search IS NULL OR c.name ILIKE '%' || v_search || '%')
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
    AND (is_admin_or_supervisor(auth.uid()) OR c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))
  ORDER BY c.name ASC NULLS LAST, c.id ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer) TO authenticated, service_role;

CREATE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$;

-- Grants default do Supabase em public.contacts.
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contacts TO authenticated;
GRANT SELECT ON public.contacts TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',true),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',false),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009',true);
INSERT INTO public.user_roles VALUES
  ('20000000-0000-0000-0000-000000000001','agent'),
  ('20000000-0000-0000-0000-000000000002','agent'),
  ('20000000-0000-0000-0000-000000000009','admin');
INSERT INTO public.queues VALUES ('50000000-0000-0000-0000-000000000001');
INSERT INTO public.queues VALUES ('50000000-0000-0000-0000-000000000002');
INSERT INTO public.queue_members VALUES ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true);

-- 3 contatos: um do agente comum, um de outro dono, um sem dono (invisivel para o comum).
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, conversation_status) VALUES
  ('30000000-0000-0000-0000-000000000001','Contato do agente','5511900000001','cliente','10000000-0000-0000-0000-000000000001','open'),
  ('30000000-0000-0000-0000-000000000002','Contato de outro','5511900000002','cliente','10000000-0000-0000-0000-000000000002','open'),
  ('30000000-0000-0000-0000-000000000003','Contato sem dono','5511900000003','fornecedor',NULL,'open');
-- 2 contatos COM fila, para a regra de exclusao alinhada a de edicao (policy de UPDATE):
--   ...0004 na fila do agente (ele e membro ativo) e atribuido a OUTRO perfil  -> pode excluir
--   ...0005 em fila alheia e atribuido a OUTRO perfil                         -> nao pode excluir
INSERT INTO public.contacts (id, name, phone, contact_type, assigned_to, queue_id, conversation_status) VALUES
  ('30000000-0000-0000-0000-000000000004','Contato da fila do agente','5511900000004','cliente','10000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','open'),
  ('30000000-0000-0000-0000-000000000005','Contato de fila alheia','5511900000005','cliente','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','open');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

AGENTE='20000000-0000-0000-0000-000000000001'
ADMIN='20000000-0000-0000-0000-000000000009'
ALHEIO='20000000-0000-0000-0000-000000000002'

# ── RED: o P0 da auditoria, antes das migrations ──────────────────────────────────────────
expect_value 'RLS de contacts ligada' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid='public.contacts'::regclass"
expect_value 'nenhuma policy de DELETE em contacts (causa do P0)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND cmd IN ('DELETE','ALL')"
expect_failure 'RED: gravacao de pending falha antes da migration 14 (CHECKs conflitantes)' \
  "UPDATE public.contacts SET conversation_status='pending' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'RED: transicao open->closed falha antes da migration 14' \
  "UPDATE public.contacts SET conversation_status='closed' WHERE id='30000000-0000-0000-0000-000000000001'"

# ── Aplica as migrations da F1 ────────────────────────────────────────────────────────────
psql_file "$migration_soft_delete" >/dev/null
psql_file "$migration_sicoob" >/dev/null
psql_file "$migration_status" >/dev/null
psql_file "$migration_delete_align" >/dev/null
psql_file "$migration_helper" >/dev/null

# Producao tem search_contacts com as 6 colunas de endereco, mas o ARQUIVO de 20260929370000
# ficou com 17 colunas: o SQL realmente aplicado (ledger) tem 23 e o par arquivo<->ledger foi
# reconciliado por hash em scripts/db-audit/migration-evidence.json (safer-replay). O harness
# reproduz o estado REAL de producao aqui -- senao o proximo CREATE OR REPLACE seria recusado
# por mudanca de RETURNS (42P13) por um motivo que nao existe no banco.
cat > "$tmp_dir/search_contacts_producao.sql" <<'SQL'
DROP FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer);
CREATE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_search text; BEGIN
  v_search := NULLIF(TRIM(search_term), '');
  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at, c.latitude, c.longitude,
    c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code,
    COUNT(*) OVER () AS total_count
  FROM public.contacts c
  WHERE
    c.deleted_at IS NULL
    AND (v_search IS NULL OR (
      c.name      ILIKE '%' || v_search || '%' OR
      c.nickname  ILIKE '%' || v_search || '%' OR
      c.surname   ILIKE '%' || v_search || '%' OR
      c.phone     ILIKE '%' || v_search || '%' OR
      c.email     ILIKE '%' || v_search || '%' OR
      c.company   ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter       IS NULL OR c.company      = company_filter)
    AND (job_title_filter     IS NULL OR c.job_title    = job_title_filter)
    AND (tag_filter           IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from            IS NULL OR c.created_at  >= date_from)
    AND (
      is_admin_or_supervisor(auth.uid())
      OR c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id   = c.queue_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active  = true
      )
    )
  ORDER BY c.name ASC NULLS LAST, c.id ASC
  LIMIT page_size OFFSET page_offset;
END;
$function$;
SQL
psql_file "$tmp_dir/search_contacts_producao.sql" >/dev/null

psql_file "$migration_single_predicate" >/dev/null
psql_file "$migration_guards" >/dev/null
psql_file "$migration_hoisted" >/dev/null
# `can_delete_contacts` ignora contato ja excluido de proposito (a lista nao mostra excluidos).
expect_value 'can_delete_contacts: dono e membro de fila true, fila alheia false' 'true,true,false' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT string_agg(can_delete::text, ',' ORDER BY contact_id) FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005']::uuid[])"
expect_value 'can_delete_contacts: sem vinculo nenhum devolve false' 'false,false,false' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000077'; SELECT string_agg(can_delete::text, ',' ORDER BY contact_id) FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005']::uuid[])"
expect_value 'admin recebe can_delete true em contato alheio' 'true' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT string_agg(can_delete::text, ',') FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000005']::uuid[])"

# ── GREEN: etapa 14 (status canonico + FSM) ───────────────────────────────────────────────
expect_value 'so existe UM CHECK de conversation_status' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.contacts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%conversation_status%'"
expect_value 'GREEN: open -> pending passa' 'pending' \
  "UPDATE public.contacts SET conversation_status='pending' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'GREEN: pending -> closed passa' 'closed' \
  "UPDATE public.contacts SET conversation_status='closed' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'GREEN: closed -> archived passa' 'archived' \
  "UPDATE public.contacts SET conversation_status='archived' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'GREEN: archived -> open (desarquivar) passa' 'open' \
  "UPDATE public.contacts SET conversation_status='open' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"
expect_value 'timestamps de transicao gravados' 't' \
  "SELECT (conversation_status_changed_at IS NOT NULL) FROM public.contacts WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'FSM ainda barra resolved -> waiting' \
  "UPDATE public.contacts SET conversation_status='resolved' WHERE id='30000000-0000-0000-0000-000000000001'; UPDATE public.contacts SET conversation_status='waiting' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'CHECK continua barrando valor fora do conjunto canonico' \
  "UPDATE public.contacts SET conversation_status='banana' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_value 'volta para open para o resto do teste' 'open' \
  "UPDATE public.contacts SET conversation_status='open' WHERE id='30000000-0000-0000-0000-000000000001' RETURNING conversation_status"

# ── GREEN: etapas 7/9 (delete_contact/delete_contacts) ────────────────────────────────────
expect_value 'anon nao tem EXECUTE em delete_contact' 'f' \
  "SELECT has_function_privilege('anon','public.delete_contact(uuid)','EXECUTE')"
expect_value 'authenticated tem EXECUTE em delete_contact' 't' \
  "SELECT has_function_privilege('authenticated','public.delete_contact(uuid)','EXECUTE')"
expect_value 'admin exclui contato alheio e recebe o id' '30000000-0000-0000-0000-000000000002' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000002')"
expect_value 'contato excluido tem deleted_at preenchido' 't' \
  "SELECT (deleted_at IS NOT NULL) FROM public.contacts WHERE id='30000000-0000-0000-0000-000000000002'"
expect_value 'dono exclui o proprio contato' '30000000-0000-0000-0000-000000000001' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000001')"
expect_failure 'agente sem vinculo (nem dono, nem fila) nao exclui contato' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000003')"
expect_value 'agente membro ATIVO da fila exclui contato da fila (regra de edicao)' '30000000-0000-0000-0000-000000000004' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000004')"
expect_failure 'agente de outra fila nao exclui contato de fila alheia' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000005')"
expect_value 'admin exclui o contato de fila alheia (fecha o estado para as contagens)' '30000000-0000-0000-0000-000000000005' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000005')"
expect_failure 'excluir duas vezes falha em vez de fingir sucesso' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contact('30000000-0000-0000-0000-000000000002')"
expect_failure 'delete_contacts sem nenhuma linha permitida falha' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ALHEIO'; SELECT public.delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])"
expect_value 'delete_contacts em lote devolve a contagem' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT public.delete_contacts(ARRAY['30000000-0000-0000-0000-000000000003']::uuid[])"

# ── GREEN: etapas 8/10 (excluidos somem de search_contacts e contacts_count_by_type) ──────
expect_value 'search_contacts do admin nao devolve excluidos' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT count(*) FROM public.search_contacts()"
expect_value 'contacts_count_by_type nao conta excluidos' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$ADMIN'; SELECT COALESCE(sum(count),0) FROM public.contacts_count_by_type()"
expect_value 'restaurar o soft-delete traz o contato de volta' '1' \
  "UPDATE public.contacts SET deleted_at=NULL WHERE id='30000000-0000-0000-0000-000000000001' RETURNING 1"
expect_value 'apos restaurar, search_contacts volta a enxergar' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$AGENTE'; SELECT count(*) FROM public.search_contacts()"
expect_value 'indice parcial de deleted_at existe' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_contacts_deleted_at'"

# ── GREEN: etapa 11 (Sicoob Bridge desligada) ─────────────────────────────────────────────
expect_value 'trigger trg_sicoob_reply removido de messages' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND tgname='trg_sicoob_reply'"
expect_value 'funcao notify_sicoob_on_reply removida' '0' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='notify_sicoob_on_reply'"

# ── GREEN: etapa 15 (grants) ──────────────────────────────────────────────────────────────
expect_value 'authenticated sem TRUNCATE/REFERENCES' 'f' \
  "SELECT has_table_privilege('authenticated','public.contacts','TRUNCATE,REFERENCES')"
expect_value 'anon sem SELECT' 'f' \
  "SELECT has_table_privilege('anon','public.contacts','SELECT')"
expect_value 'anon sem TRUNCATE/REFERENCES' 'f' \
  "SELECT has_table_privilege('anon','public.contacts','TRUNCATE,REFERENCES')"
expect_value 'authenticated preserva CRUD do front' 't' \
  "SELECT has_table_privilege('authenticated','public.contacts','SELECT,INSERT,UPDATE,DELETE')"
expect_value 'service_role preserva CRUD' 't' \
  "SELECT has_table_privilege('service_role','public.contacts','SELECT,INSERT,UPDATE,DELETE')"

# ── GREEN: debito pos-#1187 item 2 (um predicado so: ver/editar/excluir) ──────────────────
expect_value 'helper can_edit_contact existe (2 args compat + 5 args policies)' '2' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='can_edit_contact'"
expect_value 'delete_contact usa o helper (sem predicado inline)' '1' \
  "SELECT (pg_get_functiondef('public.delete_contact(uuid)'::regprocedure) LIKE '%can_edit_contact%')::int"
expect_value 'delete_contacts usa o helper' '1' \
  "SELECT (pg_get_functiondef('public.delete_contacts(uuid[])'::regprocedure) LIKE '%can_edit_contact%')::int"
expect_value 'search_contacts usa o helper' '1' \
  "SELECT (pg_get_functiondef('public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)'::regprocedure) LIKE '%can_edit_contact%')::int"
expect_value 'policy de UPDATE usa o helper' '1' \
  "SELECT (qual LIKE '%can_edit_contact%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Users can update their assigned contacts'"
expect_value 'policy de SELECT usa o helper' '1' \
  "SELECT (qual LIKE '%can_edit_contact%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_policy'"
# (os casos de can_delete_contacts ficam no bloco logo apos as migrations, com os contatos vivos)
expect_failure 'anon nao pode chamar can_delete_contacts' \
  "SET ROLE anon; SELECT * FROM public.can_delete_contacts(ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])"
# Expressao de policy roda como o CHAMADOR: sem EXECUTE para authenticated, todo SELECT
# em contacts passa a falhar com "permission denied for function can_edit_contact".
expect_value 'authenticated executa can_edit_contact (policy roda como chamador)' 't' \
  "SELECT has_function_privilege('authenticated','public.can_edit_contact(uuid,uuid)','EXECUTE')"
expect_value 'anon NAO executa can_edit_contact' 'f' \
  "SELECT has_function_privilege('anon','public.can_edit_contact(uuid, uuid)','EXECUTE')"
# 20260929795000: a versao de 5 argumentos e a que as policies chamam, e os lookups caros
# vao por parametro -- se alguem voltar a chamar a de 2 argumentos dentro da policy, o custo
# por linha volta (medido: 3,2s contra 128ms para varrer os 3.104 contatos de producao).
expect_value 'authenticated executa can_edit_contact de 5 argumentos' 't' \
  "SELECT has_function_privilege('authenticated','public.can_edit_contact(uuid, uuid, uuid[], uuid, boolean)','EXECUTE')"
expect_value 'anon NAO executa a versao de 5 argumentos' 'f' \
  "SELECT has_function_privilege('anon','public.can_edit_contact(uuid, uuid, uuid[], uuid, boolean)','EXECUTE')"
expect_value 'policy de UPDATE passa os lookups por parametro' '1' \
  "SELECT (qual LIKE '%get_visible_agent_ids%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Users can update their assigned contacts'"
expect_value 'policy de SELECT passa os lookups por parametro' '1' \
  "SELECT (qual LIKE '%get_visible_agent_ids%')::int FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_policy'"
expect_value 'a versao de 2 argumentos delega para a de 5' 'true' \
  "SELECT (pg_get_functiondef('public.can_edit_contact(uuid, uuid)'::regprocedure) LIKE '%can_edit_contact(p_assigned_to, p_queue_id, NULL%')::text"
expect_value 'authenticated executa can_delete_contacts' 't' \
  "SELECT has_function_privilege('authenticated','public.can_delete_contacts(uuid[])','EXECUTE')"

# ── GREEN: debito pos-#1187 item 3 (guards de atribuicao so quando o campo muda) ──────────
# No estado anterior, qualquer UPDATE em contato com `queue_id` nulo e dono alheio era
# recusado com "Sem permissao para atribuir contato a este agente" -- mesmo sem ninguem
# ser reatribuido. As duas primeiras assercoes sao o que muda; as duas ultimas garantem
# que a protecao de verdade (reatribuir/trocar de fila) continua valendo.
# --1187 item 3: contato COM fila cujo responsavel esta INATIVO. Antes, qualquer UPDATE
# nesse contato (nota, status, soft-delete) era recusado pelo guard do responsavel, mesmo sem
# ninguem ser reatribuido; agora o guard so olha reatribuicao de verdade e o membro da fila
# edita. As duas assercoes seguintes garantem que a protecao real continua valendo.
claims_agente="SET ROLE authenticated; SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$AGENTE\"}'; SET request.jwt.claim.sub='$AGENTE';"
expect_value 'contato de fila com responsavel inativo: membro da fila edita' '1' \
  "$claims_agente UPDATE public.contacts SET notes='ok' WHERE id='30000000-0000-0000-0000-000000000004' RETURNING 1"
expect_value 'soft-delete direto nao esbarra nos guards de atribuicao/fila' '1' \
  "$claims_agente UPDATE public.contacts SET deleted_at=now() WHERE id='30000000-0000-0000-0000-000000000004' RETURNING 1"
expect_failure 'reatribuir contato para outro agente continua proibido' \
  "$claims_agente UPDATE public.contacts SET assigned_to='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001'"
expect_failure 'mover contato para fila alheia continua proibido' \
  "$claims_agente UPDATE public.contacts SET queue_id='50000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000004'"

# ── Idempotencia (as migrations sao reaplicaveis) ─────────────────────────────────────────
# `migration_soft_delete` fica FORA deste bloco de proposito: o arquivo de 20260929370000
# declara search_contacts com 17 colunas enquanto o SQL aplicado em producao tem 23 (o par
# arquivo<->ledger foi reconciliado por hash em scripts/db-audit/migration-evidence.json,
# safer-replay). Reaplicar o arquivo byte-a-byte nao e o comportamento esperado -- o que
# precisa ser reaplicavel sao as migrations seguintes, incluindo as deste PR.
psql_file "$migration_sicoob" >/dev/null
psql_file "$migration_status" >/dev/null
psql_file "$migration_delete_align" >/dev/null
psql_file "$migration_helper" >/dev/null
psql_file "$migration_single_predicate" >/dev/null
psql_file "$migration_guards" >/dev/null
psql_file "$migration_hoisted" >/dev/null
expect_value 'reaplicacao nao duplica a coluna deleted_at' '1' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='deleted_at'"
expect_value 'reaplicacao mantem um unico CHECK de status' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.contacts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%conversation_status%'"

printf 'Contacts F1 (soft-delete, Sicoob, status, grants) PostgreSQL 17 behavioral contract: PASS\n'
